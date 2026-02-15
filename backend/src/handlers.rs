use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::Json;
use serde_json::{json, Value};
use sysinfo::System;
use tokio_stream::StreamExt;

use crate::models::*;
use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  Health & System
// ═══════════════════════════════════════════════════════════════════════

pub async fn health_check(State(state): State<AppState>) -> Json<Value> {
    let uptime = state.start_time.elapsed().as_secs();
    let rt = state.runtime.read().await;

    let resp = HealthResponse {
        status: "ok".to_string(),
        version: "4.0.0".to_string(),
        app: "ClaudeHydra".to_string(),
        uptime_seconds: uptime,
        providers: vec![
            ProviderInfo {
                name: "anthropic".to_string(),
                available: rt.api_keys.contains_key("ANTHROPIC_API_KEY"),
            },
            ProviderInfo {
                name: "google".to_string(),
                available: rt.api_keys.contains_key("GOOGLE_API_KEY"),
            },
        ],
    };

    Json(serde_json::to_value(resp).unwrap())
}

pub async fn system_stats() -> Json<Value> {
    let mut sys = System::new_all();
    sys.refresh_all();

    // Brief pause then re-read CPU so the first sample isn't always 0
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    sys.refresh_cpu_usage();

    let cpu_usage: f32 = {
        let cpus = sys.cpus();
        if cpus.is_empty() {
            0.0
        } else {
            cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32
        }
    };

    let total_mem = sys.total_memory() as f64 / 1_048_576.0;
    let used_mem = sys.used_memory() as f64 / 1_048_576.0;

    let stats = SystemStats {
        cpu_usage_percent: cpu_usage,
        memory_used_mb: used_mem,
        memory_total_mb: total_mem,
        platform: std::env::consts::OS.to_string(),
    };

    Json(serde_json::to_value(stats).unwrap())
}

// ═══════════════════════════════════════════════════════════════════════
//  Agents
// ═══════════════════════════════════════════════════════════════════════

pub async fn list_agents(State(state): State<AppState>) -> Json<Value> {
    Json(serde_json::to_value(&state.agents).unwrap())
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude API
// ═══════════════════════════════════════════════════════════════════════

/// GET /api/claude/models — static list of 3 Claude models
pub async fn claude_models() -> Json<Value> {
    let models = vec![
        ClaudeModelInfo {
            id: "claude-opus-4-6".to_string(),
            name: "Claude Opus 4.6".to_string(),
            tier: "Commander".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        ClaudeModelInfo {
            id: "claude-sonnet-4-5-20250929".to_string(),
            name: "Claude Sonnet 4.5".to_string(),
            tier: "Coordinator".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        ClaudeModelInfo {
            id: "claude-haiku-4-5-20251001".to_string(),
            name: "Claude Haiku 4.5".to_string(),
            tier: "Executor".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
    ];

    Json(serde_json::to_value(models).unwrap())
}

/// POST /api/claude/chat — non-streaming Claude request
pub async fn claude_chat(
    State(state): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let api_key = {
        let rt = state.runtime.read().await;
        rt.api_keys
            .get("ANTHROPIC_API_KEY")
            .cloned()
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "ANTHROPIC_API_KEY not configured" })),
                )
            })?
    };

    let model = req
        .model
        .unwrap_or_else(|| "claude-sonnet-4-5-20250929".to_string());
    let max_tokens = req.max_tokens.unwrap_or(4096);

    let messages: Vec<Value> = req
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    });

    if let Some(temp) = req.temperature {
        body["temperature"] = json!(temp);
    }

    // Route through local anthropic-max-router proxy (OAuth from Claude Max plan)
    let api_url = std::env::var("ANTHROPIC_API_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());

    let resp = state
        .client
        .post(format!("{}/v1/messages", api_url))
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("Failed to reach Anthropic API: {}", e) })),
            )
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body: Value = resp.json().await.unwrap_or_default();
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(json!({ "error": err_body })),
        ));
    }

    let resp_body: Value = resp.json().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Invalid JSON from Anthropic: {}", e) })),
        )
    })?;

    // Extract text from Anthropic content blocks
    let content = resp_body
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<&str>>()
                .join("")
        })
        .unwrap_or_default();

    let response_model = resp_body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or(&model)
        .to_string();

    let usage = resp_body.get("usage").map(|u| UsageInfo {
        prompt_tokens: u
            .get("input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        completion_tokens: u
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        total_tokens: (u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
            + u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0))
            as u32,
    });

    let chat_resp = ChatResponse {
        id: resp_body
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        message: ChatMessage {
            role: "assistant".to_string(),
            content,
            model: Some(response_model.clone()),
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        },
        model: response_model,
        usage,
    };

    Ok(Json(serde_json::to_value(chat_resp).unwrap()))
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Streaming  (SSE from Anthropic → NDJSON to frontend)
// ═══════════════════════════════════════════════════════════════════════

/// POST /api/claude/chat/stream
///
/// Sends a streaming request to Anthropic and re-emits as NDJSON:
/// ```text
/// {"token":"Hello","done":false}
/// {"token":" world","done":false}
/// {"token":"","done":true,"model":"claude-sonnet-4-5-20250929","total_tokens":42}
/// ```
pub async fn claude_chat_stream(
    State(state): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    // Gate: if tools_enabled, route to agentic handler
    if req.tools_enabled.unwrap_or(false) {
        return claude_chat_stream_with_tools(state, req).await;
    }

    let api_key = {
        let rt = state.runtime.read().await;
        rt.api_keys
            .get("ANTHROPIC_API_KEY")
            .cloned()
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "ANTHROPIC_API_KEY not configured" })),
                )
            })?
    };

    let model = req
        .model
        .clone()
        .unwrap_or_else(|| "claude-sonnet-4-5-20250929".to_string());
    let max_tokens = req.max_tokens.unwrap_or(4096);

    let messages: Vec<Value> = req
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "stream": true,
    });

    if let Some(temp) = req.temperature {
        body["temperature"] = json!(temp);
    }

    // Route through local anthropic-max-router proxy (OAuth from Claude Max plan)
    let api_url = std::env::var("ANTHROPIC_API_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());

    let resp = state
        .client
        .post(format!("{}/v1/messages", api_url))
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("Failed to reach Anthropic API: {}", e) })),
            )
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body: Value = resp.json().await.unwrap_or_default();
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(json!({ "error": err_body })),
        ));
    }

    // Convert Anthropic SSE stream into NDJSON
    let model_for_done = model.clone();
    let byte_stream = resp.bytes_stream();

    let ndjson_stream = async_stream::stream! {
        let mut sse_buffer = String::new();
        let mut total_tokens: u32 = 0;
        let mut stream = byte_stream;

        while let Some(chunk_result) = stream.next().await {
            let chunk = match chunk_result {
                Ok(bytes) => bytes,
                Err(e) => {
                    let err_line = serde_json::to_string(&json!({
                        "token": format!("\n[Stream error: {}]", e),
                        "done": true,
                        "model": &model_for_done,
                        "total_tokens": total_tokens,
                    })).unwrap_or_default();
                    yield Ok::<_, std::io::Error>(
                        axum::body::Bytes::from(format!("{}\n", err_line))
                    );
                    break;
                }
            };

            sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE lines
            while let Some(newline_pos) = sse_buffer.find('\n') {
                let line = sse_buffer[..newline_pos].trim().to_string();
                sse_buffer = sse_buffer[newline_pos + 1..].to_string();

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                // Parse SSE "data: {...}" lines
                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" {
                        continue;
                    }

                    if let Ok(event) = serde_json::from_str::<Value>(data) {
                        let event_type = event.get("type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("");

                        match event_type {
                            "content_block_delta" => {
                                let text = event
                                    .get("delta")
                                    .and_then(|d| d.get("text"))
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("");

                                if !text.is_empty() {
                                    let ndjson_line = serde_json::to_string(&json!({
                                        "token": text,
                                        "done": false,
                                    })).unwrap_or_default();

                                    yield Ok::<_, std::io::Error>(
                                        axum::body::Bytes::from(format!("{}\n", ndjson_line))
                                    );
                                }
                            }
                            "message_delta" => {
                                // Extract usage from the final message_delta
                                if let Some(usage) = event.get("usage") {
                                    let output = usage
                                        .get("output_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0) as u32;
                                    total_tokens = output;
                                }
                            }
                            "message_stop" => {
                                let done_line = serde_json::to_string(&json!({
                                    "token": "",
                                    "done": true,
                                    "model": &model_for_done,
                                    "total_tokens": total_tokens,
                                })).unwrap_or_default();

                                yield Ok::<_, std::io::Error>(
                                    axum::body::Bytes::from(format!("{}\n", done_line))
                                );
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    };

    let body = Body::from_stream(ndjson_stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(body)
        .unwrap())
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Streaming with Tools  (agentic tool_use loop)
// ═══════════════════════════════════════════════════════════════════════

const MAX_TOOL_ITERATIONS: usize = 10;

/// Agentic handler: sends tools[] to Anthropic, loops on tool_use,
/// executes tools locally via ToolExecutor, emits extended NDJSON.
async fn claude_chat_stream_with_tools(
    state: AppState,
    req: ChatRequest,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let api_key = {
        let rt = state.runtime.read().await;
        rt.api_keys
            .get("ANTHROPIC_API_KEY")
            .cloned()
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "ANTHROPIC_API_KEY not configured" })),
                )
            })?
    };

    let model = req
        .model
        .clone()
        .unwrap_or_else(|| "claude-sonnet-4-5-20250929".to_string());
    let max_tokens = req.max_tokens.unwrap_or(4096);

    // Build initial messages
    let initial_messages: Vec<Value> = req
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    // Build tool definitions
    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions()
        .into_iter()
        .map(|td| {
            json!({
                "name": td.name,
                "description": td.description,
                "input_schema": td.input_schema,
            })
        })
        .collect();

    let api_url = std::env::var("ANTHROPIC_API_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());

    // Use a channel to send NDJSON lines from the spawned task
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(256);

    let tool_executor = state.tool_executor.clone();
    let client = state.client.clone();

    tokio::spawn(async move {
        let mut conversation: Vec<Value> = initial_messages;
        let mut iteration = 0;

        loop {
            iteration += 1;
            if iteration > MAX_TOOL_ITERATIONS {
                let _ = tx
                    .send(
                        serde_json::to_string(&json!({
                            "token": "\n[Max tool iterations reached]",
                            "done": true,
                            "model": &model,
                            "total_tokens": 0,
                        }))
                        .unwrap_or_default(),
                    )
                    .await;
                break;
            }

            let mut body = json!({
                "model": &model,
                "max_tokens": max_tokens,
                "messages": &conversation,
                "tools": &tool_defs,
                "stream": true,
            });

            if let Some(temp) = req.temperature {
                body["temperature"] = json!(temp);
            }

            // Send request to Anthropic
            let resp = match client
                .post(format!("{}/v1/messages", api_url))
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .timeout(std::time::Duration::from_secs(300))
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx
                        .send(
                            serde_json::to_string(&json!({
                                "token": format!("\n[API error: {}]", e),
                                "done": true,
                                "model": &model,
                                "total_tokens": 0,
                            }))
                            .unwrap_or_default(),
                        )
                        .await;
                    break;
                }
            };

            if !resp.status().is_success() {
                let err_text = resp.text().await.unwrap_or_default();
                let _ = tx
                    .send(
                        serde_json::to_string(&json!({
                            "token": format!("\n[Anthropic error: {}]", err_text),
                            "done": true,
                            "model": &model,
                            "total_tokens": 0,
                        }))
                        .unwrap_or_default(),
                    )
                    .await;
                break;
            }

            // Parse SSE stream — collect content blocks
            let mut sse_buffer = String::new();
            let mut text_content = String::new();
            let mut tool_uses: Vec<Value> = Vec::new();
            let mut current_tool_id = String::new();
            let mut current_tool_name = String::new();
            let mut current_tool_input_json = String::new();
            let mut in_tool_use = false;
            let mut stop_reason = String::new();
            let mut total_tokens: u32 = 0;

            let mut byte_stream = resp.bytes_stream();

            while let Some(chunk_result) = byte_stream.next().await {
                let chunk = match chunk_result {
                    Ok(bytes) => bytes,
                    Err(_) => break,
                };

                sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(newline_pos) = sse_buffer.find('\n') {
                    let line = sse_buffer[..newline_pos].trim().to_string();
                    sse_buffer = sse_buffer[newline_pos + 1..].to_string();

                    if line.is_empty() || line.starts_with(':') {
                        continue;
                    }

                    let data = match line.strip_prefix("data: ") {
                        Some(d) if d != "[DONE]" => d,
                        _ => continue,
                    };

                    let event: Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };

                    let event_type = event
                        .get("type")
                        .and_then(|t| t.as_str())
                        .unwrap_or("");

                    match event_type {
                        "content_block_start" => {
                            let cb = event.get("content_block").unwrap_or(&Value::Null);
                            let cb_type =
                                cb.get("type").and_then(|t| t.as_str()).unwrap_or("");

                            if cb_type == "tool_use" {
                                in_tool_use = true;
                                current_tool_id = cb
                                    .get("id")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                current_tool_name = cb
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                current_tool_input_json.clear();
                            }
                        }
                        "content_block_delta" => {
                            let delta =
                                event.get("delta").unwrap_or(&Value::Null);
                            let delta_type = delta
                                .get("type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("");

                            if delta_type == "text_delta" {
                                let text = delta
                                    .get("text")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("");
                                if !text.is_empty() {
                                    text_content.push_str(text);
                                    // Emit text token to frontend
                                    let _ = tx
                                        .send(
                                            serde_json::to_string(&json!({
                                                "token": text,
                                                "done": false,
                                            }))
                                            .unwrap_or_default(),
                                        )
                                        .await;
                                }
                            } else if delta_type == "input_json_delta" {
                                let partial = delta
                                    .get("partial_json")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("");
                                current_tool_input_json.push_str(partial);
                            }
                        }
                        "content_block_stop" => {
                            if in_tool_use {
                                let tool_input: Value =
                                    serde_json::from_str(&current_tool_input_json)
                                        .unwrap_or(json!({}));

                                // Emit tool_call event to frontend
                                let _ = tx
                                    .send(
                                        serde_json::to_string(&json!({
                                            "type": "tool_call",
                                            "tool_use_id": &current_tool_id,
                                            "tool_name": &current_tool_name,
                                            "tool_input": &tool_input,
                                        }))
                                        .unwrap_or_default(),
                                    )
                                    .await;

                                tool_uses.push(json!({
                                    "type": "tool_use",
                                    "id": &current_tool_id,
                                    "name": &current_tool_name,
                                    "input": tool_input,
                                }));

                                in_tool_use = false;
                            }
                        }
                        "message_delta" => {
                            if let Some(sr) = event
                                .get("delta")
                                .and_then(|d| d.get("stop_reason"))
                                .and_then(|s| s.as_str())
                            {
                                stop_reason = sr.to_string();
                            }
                            if let Some(usage) = event.get("usage") {
                                total_tokens = usage
                                    .get("output_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                            }
                        }
                        _ => {}
                    }
                }
            }

            // After stream completes — check stop_reason
            if stop_reason == "tool_use" && !tool_uses.is_empty() {
                // Build assistant message with all content blocks
                let mut assistant_blocks: Vec<Value> = Vec::new();
                if !text_content.is_empty() {
                    assistant_blocks.push(json!({
                        "type": "text",
                        "text": &text_content,
                    }));
                }
                assistant_blocks.extend(tool_uses.clone());

                conversation.push(json!({
                    "role": "assistant",
                    "content": assistant_blocks,
                }));

                // Execute each tool and build tool_result blocks
                let mut tool_results: Vec<Value> = Vec::new();
                for tu in &tool_uses {
                    let tool_name =
                        tu.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let tool_id =
                        tu.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let empty_input = json!({});
                    let tool_input = tu.get("input").unwrap_or(&empty_input);

                    let (result, is_error) =
                        tool_executor.execute(tool_name, tool_input).await;

                    // Emit tool_result event to frontend
                    let _ = tx
                        .send(
                            serde_json::to_string(&json!({
                                "type": "tool_result",
                                "tool_use_id": tool_id,
                                "result": &result,
                                "is_error": is_error,
                            }))
                            .unwrap_or_default(),
                        )
                        .await;

                    tool_results.push(json!({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": &result,
                        "is_error": is_error,
                    }));
                }

                // Add user message with tool results
                conversation.push(json!({
                    "role": "user",
                    "content": tool_results,
                }));

                // Reset text for next iteration
                text_content.clear();

                // Continue loop — next iteration
                continue;
            }

            // stop_reason == "end_turn" or other — emit done
            let _ = tx
                .send(
                    serde_json::to_string(&json!({
                        "token": "",
                        "done": true,
                        "model": &model,
                        "total_tokens": total_tokens,
                    }))
                    .unwrap_or_default(),
                )
                .await;
            break;
        }
    });

    // Convert channel receiver into a byte stream
    let ndjson_stream = async_stream::stream! {
        let mut rx = rx;
        while let Some(line) = rx.recv().await {
            yield Ok::<_, std::io::Error>(
                axum::body::Bytes::from(format!("{}\n", line))
            );
        }
    };

    let body = Body::from_stream(ndjson_stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(body)
        .unwrap())
}

// ═══════════════════════════════════════════════════════════════════════
//  Settings (DB-backed)
// ═══════════════════════════════════════════════════════════════════════

pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let row = sqlx::query_as::<_, SettingsRow>(
        "SELECT theme, language, default_model, auto_start FROM ch_settings WHERE id = 1",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch settings: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let settings = AppSettings {
        theme: row.theme,
        language: row.language,
        default_model: row.default_model,
        auto_start: row.auto_start,
    };

    Ok(Json(serde_json::to_value(settings).unwrap()))
}

pub async fn update_settings(
    State(state): State<AppState>,
    Json(new_settings): Json<AppSettings>,
) -> Result<Json<Value>, StatusCode> {
    sqlx::query(
        "UPDATE ch_settings SET theme = $1, language = $2, default_model = $3, \
         auto_start = $4, updated_at = NOW() WHERE id = 1",
    )
    .bind(&new_settings.theme)
    .bind(&new_settings.language)
    .bind(&new_settings.default_model)
    .bind(new_settings.auto_start)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update settings: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(serde_json::to_value(&new_settings).unwrap()))
}

pub async fn set_api_key(
    State(state): State<AppState>,
    Json(req): Json<ApiKeyRequest>,
) -> Json<Value> {
    let mut rt = state.runtime.write().await;
    rt.api_keys.insert(req.provider.clone(), req.key);
    Json(json!({ "status": "ok", "provider": req.provider }))
}

// ═══════════════════════════════════════════════════════════════════════
//  Sessions & History (DB-backed)
// ═══════════════════════════════════════════════════════════════════════

pub async fn list_sessions(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let rows = sqlx::query_as::<_, SessionSummaryRow>(
        "SELECT s.id, s.title, s.created_at, \
         (SELECT COUNT(*) FROM ch_messages WHERE session_id = s.id) as message_count \
         FROM ch_sessions s ORDER BY s.updated_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list sessions: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let summaries: Vec<SessionSummary> = rows
        .into_iter()
        .map(|r| SessionSummary {
            id: r.id.to_string(),
            title: r.title,
            created_at: r.created_at.to_rfc3339(),
            message_count: r.message_count as usize,
        })
        .collect();

    Ok(Json(serde_json::to_value(summaries).unwrap()))
}

pub async fn create_session(
    State(state): State<AppState>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    let row = sqlx::query_as::<_, SessionRow>(
        "INSERT INTO ch_sessions (title) VALUES ($1) \
         RETURNING id, title, created_at, updated_at",
    )
    .bind(&req.title)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let session = Session {
        id: row.id.to_string(),
        title: row.title,
        created_at: row.created_at.to_rfc3339(),
        messages: Vec::new(),
    };

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(session).unwrap()),
    ))
}

pub async fn get_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    let session_row = sqlx::query_as::<_, SessionRow>(
        "SELECT id, title, created_at, updated_at FROM ch_sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let message_rows = sqlx::query_as::<_, MessageRow>(
        "SELECT id, session_id, role, content, model, agent, created_at \
         FROM ch_messages WHERE session_id = $1 ORDER BY created_at ASC",
    )
    .bind(session_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get session messages: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Load tool interactions for all messages in this session
    let ti_rows = sqlx::query_as::<_, ToolInteractionRow>(
        "SELECT ti.id, ti.message_id, ti.tool_use_id, ti.tool_name, \
         ti.tool_input, ti.result, ti.is_error, ti.executed_at \
         FROM ch_tool_interactions ti \
         INNER JOIN ch_messages m ON ti.message_id = m.id \
         WHERE m.session_id = $1 \
         ORDER BY ti.executed_at ASC",
    )
    .bind(session_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Group tool interactions by message_id
    let mut ti_map: std::collections::HashMap<uuid::Uuid, Vec<ToolInteractionInfo>> =
        std::collections::HashMap::new();
    for ti in ti_rows {
        ti_map
            .entry(ti.message_id)
            .or_default()
            .push(ToolInteractionInfo {
                tool_use_id: ti.tool_use_id,
                tool_name: ti.tool_name,
                tool_input: ti.tool_input,
                result: ti.result,
                is_error: ti.is_error,
            });
    }

    let messages: Vec<HistoryEntry> = message_rows
        .into_iter()
        .map(|m| {
            let interactions = ti_map.remove(&m.id);
            HistoryEntry {
                id: m.id.to_string(),
                role: m.role,
                content: m.content,
                model: m.model,
                agent: m.agent,
                timestamp: m.created_at.to_rfc3339(),
                tool_interactions: interactions,
            }
        })
        .collect();

    let session = Session {
        id: session_row.id.to_string(),
        title: session_row.title,
        created_at: session_row.created_at.to_rfc3339(),
        messages,
    };

    Ok(Json(serde_json::to_value(session).unwrap()))
}

pub async fn delete_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    let result = sqlx::query("DELETE FROM ch_sessions WHERE id = $1")
        .bind(session_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete session: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(json!({ "status": "deleted", "id": id })))
}

pub async fn add_session_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<AddMessageRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    // Verify session exists
    let exists = sqlx::query("SELECT 1 FROM ch_sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check session: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let row = sqlx::query_as::<_, MessageRow>(
        "INSERT INTO ch_messages (session_id, role, content, model, agent) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, session_id, role, content, model, agent, created_at",
    )
    .bind(session_id)
    .bind(&req.role)
    .bind(&req.content)
    .bind(&req.model)
    .bind(&req.agent)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to add message: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Save tool interactions if present
    if let Some(ref interactions) = req.tool_interactions {
        for ti in interactions {
            sqlx::query(
                "INSERT INTO ch_tool_interactions \
                 (message_id, tool_use_id, tool_name, tool_input, result, is_error) \
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(row.id)
            .bind(&ti.tool_use_id)
            .bind(&ti.tool_name)
            .bind(&ti.tool_input)
            .bind(&ti.result)
            .bind(ti.is_error)
            .execute(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to save tool interaction: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
    }

    // Update session's updated_at timestamp
    sqlx::query("UPDATE ch_sessions SET updated_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.db)
        .await
        .ok();

    let entry = HistoryEntry {
        id: row.id.to_string(),
        role: row.role,
        content: row.content,
        model: row.model,
        agent: row.agent,
        timestamp: row.created_at.to_rfc3339(),
        tool_interactions: req.tool_interactions,
    };

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(entry).unwrap()),
    ))
}

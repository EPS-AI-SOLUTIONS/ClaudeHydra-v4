//! Streaming chat endpoints — NDJSON output from Anthropic SSE and Gemini SSE.
//!
//! - `claude_chat_stream` — streaming NDJSON with fallback chain (no-tools path)
//! - `claude_chat_stream_with_tools` — agentic tool_use loop with auto-fix
//! - `google_chat_stream` — Gemini hybrid routing for streaming

use axum::body::Body;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Response;
use axum::Json;
use serde_json::{json, Value};
use tokio_stream::StreamExt;

use crate::models::*;
use crate::state::AppState;

use super::prompt::{resolve_chat_context, ChatContext};
use super::{
    is_retryable_status, sanitize_json_strings, send_to_anthropic,
    truncate_for_context_with_limit, TOOL_TIMEOUT_SECS,
};

// ═══════════════════════════════════════════════════════════════════════
//  Gemini hybrid streaming
// ═══════════════════════════════════════════════════════════════════════

async fn google_chat_stream(
    state: AppState,
    req: ChatRequest,
    ctx: ChatContext,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let credential = crate::oauth_google::get_google_credential(&state).await;
    let (api_key, is_oauth) = match credential {
        Some(c) => c,
        None => return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "No Google API credential configured" })),
        )),
    };

    let model = &ctx.model;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
        model
    );

    let contents: Vec<Value> = req.messages.iter().map(|m| {
        let role = if m.role == "assistant" { "model" } else { "user" };
        json!({ "role": role, "parts": [{ "text": m.content }] })
    }).collect();

    let body = json!({
        "systemInstruction": { "parts": [{ "text": ctx.system_prompt }] },
        "contents": contents,
        "generationConfig": {
            "temperature": req.temperature.unwrap_or(1.0),
            "maxOutputTokens": ctx.max_tokens,
        }
    });

    let request = crate::oauth_google::apply_google_auth(
        state.http_client.post(&url), &api_key, is_oauth,
    )
    .json(&body)
    .timeout(std::time::Duration::from_secs(300));

    let resp = request.send().await.map_err(|e| (
        StatusCode::BAD_GATEWAY,
        Json(json!({ "error": format!("Google API request failed: {}", e) })),
    ))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(json!({ "error": err })),
        ));
    }

    let model_for_done = ctx.model.clone();
    let byte_stream = resp.bytes_stream();

    let ndjson_stream = async_stream::stream! {
        let mut sse_buffer = String::new();
        let mut total_tokens: u32 = 0;
        let mut stream = byte_stream;

        while let Some(chunk_result) = futures_util::StreamExt::next(&mut stream).await {
            let chunk = match chunk_result {
                Ok(b) => b,
                Err(e) => {
                    let err_line = serde_json::to_string(&json!({ "token": format!("[Error: {}]", e), "done": true, "model": &model_for_done })).unwrap_or_default();
                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", err_line)));
                    break;
                }
            };
            sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(nl) = sse_buffer.find('\n') {
                let line = sse_buffer[..nl].trim().to_string();
                sse_buffer = sse_buffer[nl + 1..].to_string();
                if line.is_empty() || line.starts_with(':') { continue; }
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(event) = serde_json::from_str::<Value>(data) {
                        if let Some(text) = event.pointer("/candidates/0/content/parts/0/text").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                let ndjson_line = serde_json::to_string(&json!({ "token": text, "done": false })).unwrap_or_default();
                                yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", ndjson_line)));
                            }
                        }
                        if let Some(usage) = event.get("usageMetadata") {
                            total_tokens = usage.get("totalTokenCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                        }
                    }
                }
            }
        }
        let done_line = serde_json::to_string(&json!({ "token": "", "done": true, "model": &model_for_done, "total_tokens": total_tokens })).unwrap_or_default();
        yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", done_line)));
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(ndjson_stream))
        .expect("Response builder with valid status and headers"))
}

// ═══════════════════════════════════════════════════════════════════════
//  Session history helpers
// ═══════════════════════════════════════════════════════════════════════

async fn load_session_history(db: &sqlx::PgPool, sid: &uuid::Uuid) -> Vec<Value> {
    let mut messages: Vec<Value> = sqlx::query_as::<_, (String, String)>(
        "SELECT role, content FROM ch_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20",
    )
    .bind(sid)
    .fetch_all(db)
    .await
    .unwrap_or_default()
    .into_iter()
    .rev()
    .map(|(r, c)| json!({ "role": r, "content": c }))
    .collect();

    // Compress old messages: truncate everything except the last 6
    for i in 0..messages.len() {
        if i < messages.len().saturating_sub(6) {
            if let Some(content) = messages[i].get_mut("content") {
                if let Some(s) = content.as_str().map(|s| s.to_string()) {
                    if s.len() > 500 {
                        let boundary = s
                            .char_indices()
                            .take_while(|(idx, _)| *idx < 500)
                            .last()
                            .map(|(idx, c)| idx + c.len_utf8())
                            .unwrap_or(500.min(s.len()));
                        *content = json!(format!(
                            "{}... [message truncated for context efficiency]",
                            &s[..boundary]
                        ));
                    }
                }
            }
        }
    }

    messages
}

fn filter_client_system_prompt(messages: &[ChatMessage]) -> Vec<Value> {
    let mut result = Vec::new();
    let mut skip_count = 0;

    if messages.len() >= 2
        && messages[0].role == "user"
        && messages[0].content.contains("Witcher-themed AI agent")
        && messages[1].role == "assistant"
        && messages[1].content.contains("Understood")
    {
        skip_count = 2;
    }

    for msg in messages.iter().skip(skip_count) {
        result.push(json!({ "role": msg.role, "content": msg.content }));
    }
    result
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Streaming (SSE from Anthropic → NDJSON to frontend)
// ═══════════════════════════════════════════════════════════════════════

/// POST /api/claude/chat/stream
#[utoipa::path(post, path = "/api/claude/chat/stream", tag = "chat",
    request_body = ChatRequest,
    responses((status = 200, description = "Streaming NDJSON response")))]
pub async fn claude_chat_stream(
    State(state): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    // Gate: if tools_enabled, route to agentic handler
    if req.tools_enabled.unwrap_or(false) {
        return claude_chat_stream_with_tools(state, req).await;
    }

    let ctx = resolve_chat_context(&state, &req).await;
    tracing::info!(
        session_id = ?ctx.session_id,
        wd = %ctx.working_directory,
        model = %ctx.model,
        "chat stream (no-tools)"
    );

    // Hybrid routing: Gemini models → Google API
    if ctx.model.starts_with("gemini-") {
        return google_chat_stream(state, req, ctx).await;
    }

    let model = ctx.model;
    let max_tokens = ctx.max_tokens;
    let system_prompt = ctx.system_prompt;

    let messages: Vec<Value> = filter_client_system_prompt(&req.messages);

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": messages,
        "stream": true,
    });

    if let Some(temp) = req.temperature {
        body["temperature"] = json!(temp);
    }

    sanitize_json_strings(&mut body);

    let resp = send_to_anthropic(&state, &body, 300).await?;

    // Fallback chain: if retryable error, try lighter model
    let resp = if !resp.status().is_success() && is_retryable_status(resp.status().as_u16()) {
        let fallback_models = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
        let mut fallback_resp = None;
        for fb_model in &fallback_models {
            if *fb_model == model { continue; }
            tracing::warn!("claude_chat_stream: {} returned {}, falling back to {}", model, resp.status(), fb_model);
            body["model"] = json!(fb_model);
            if let Ok(fb) = send_to_anthropic(&state, &body, 300).await {
                if fb.status().is_success() {
                    fallback_resp = Some(fb);
                    break;
                }
            }
        }
        fallback_resp.unwrap_or(resp)
    } else {
        resp
    };

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
    let model_for_usage = model.clone();
    let db_for_usage = state.db.clone();
    let stream_start = std::time::Instant::now();
    let prompt_len = req.messages.iter().map(|m| m.content.len()).sum::<usize>();
    let byte_stream = resp.bytes_stream();

    let ndjson_stream = async_stream::stream! {
        let mut sse_buffer = String::new();
        let mut total_tokens: u32 = 0;
        let mut output_chars: usize = 0;
        let mut stream = byte_stream;

        while let Some(chunk_result) = futures_util::StreamExt::next(&mut stream).await {
            let chunk = match chunk_result {
                Ok(bytes) => bytes,
                Err(e) => {
                    let err_line = serde_json::to_string(&json!({
                        "token": format!("\n[Stream error: {}]", e),
                        "done": true,
                        "model": &model_for_done,
                        "total_tokens": total_tokens,
                    })).unwrap_or_default();
                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", err_line)));
                    break;
                }
            };

            sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = sse_buffer.find('\n') {
                let line = sse_buffer[..newline_pos].trim().to_string();
                sse_buffer = sse_buffer[newline_pos + 1..].to_string();

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" { continue; }

                    if let Ok(event) = serde_json::from_str::<Value>(data) {
                        let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                        match event_type {
                            "content_block_delta" => {
                                let text = event.get("delta").and_then(|d| d.get("text")).and_then(|t| t.as_str()).unwrap_or("");
                                if !text.is_empty() {
                                    output_chars += text.len();
                                    let ndjson_line = serde_json::to_string(&json!({
                                        "token": text,
                                        "done": false,
                                    })).unwrap_or_default();
                                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", ndjson_line)));
                                }
                            }
                            "message_delta" => {
                                if let Some(usage) = event.get("usage") {
                                    total_tokens = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                                }
                            }
                            "message_stop" => {
                                let done_line = serde_json::to_string(&json!({
                                    "token": "",
                                    "done": true,
                                    "model": &model_for_done,
                                    "total_tokens": total_tokens,
                                })).unwrap_or_default();
                                yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", done_line)));

                                // Token usage tracking — fire-and-forget
                                let latency = stream_start.elapsed().as_millis() as i32;
                                let input_est = (prompt_len / 4) as i32;
                                let output_est = (output_chars / 4) as i32;
                                let db = db_for_usage.clone();
                                let m = model_for_usage.clone();
                                let tier = if m.contains("opus") { "commander" }
                                    else if m.contains("sonnet") { "coordinator" }
                                    else if m.contains("haiku") { "executor" }
                                    else if m.contains("flash") { "flash" }
                                    else { "coordinator" };
                                tokio::spawn(async move {
                                    let _ = sqlx::query(
                                        "INSERT INTO ch_agent_usage (agent_id, model, input_tokens, output_tokens, total_tokens, latency_ms, success, tier) \
                                         VALUES (NULL, $1, $2, $3, $4, $5, TRUE, $6)",
                                    )
                                    .bind(&m)
                                    .bind(input_est)
                                    .bind(output_est)
                                    .bind(input_est + output_est)
                                    .bind(latency)
                                    .bind(tier)
                                    .execute(&db)
                                    .await;
                                });
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(ndjson_stream))
        .expect("Response builder with valid status and headers"))
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Streaming with Tools (agentic tool_use loop)
// ═══════════════════════════════════════════════════════════════════════

async fn claude_chat_stream_with_tools(
    state: AppState,
    req: ChatRequest,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let ctx = resolve_chat_context(&state, &req).await;
    let model = ctx.model;
    let max_tokens = ctx.max_tokens;
    let effective_temperature = ctx.temperature;
    let wd = ctx.working_directory;
    let system_prompt = ctx.system_prompt;

    // Dynamic iteration cap based on prompt complexity
    let prompt_len = req.messages.last().map(|m| m.content.len()).unwrap_or(0);
    let dynamic_max: usize = if prompt_len < 200 { 15 } else if prompt_len < 1000 { 20 } else { 25 };
    let max_tool_iterations: usize = dynamic_max.min(ctx.max_iterations.max(1) as usize);

    // Build initial messages — prefer DB history when session_id present
    let initial_messages: Vec<Value> = if let Some(ref sid) = ctx.session_id {
        let mut history = load_session_history(&state.db, sid).await;
        if let Some(last) = req.messages.last() {
            history.push(json!({ "role": "user", "content": &last.content }));
        }
        history
    } else {
        filter_client_system_prompt(&req.messages)
    };

    // Build tool definitions (includes MCP tools from connected servers)
    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(&state)
        .await
        .into_iter()
        .map(|td| json!({
            "name": td.name,
            "description": td.description,
            "input_schema": td.input_schema,
        }))
        .collect();

    let (tx, rx) = tokio::sync::mpsc::channel::<String>(256);
    let state_clone = state.clone();

    tokio::spawn(async move {
        let mut conversation: Vec<Value> = initial_messages;
        let mut iteration: usize = 0;
        let mut has_written_file = false;
        let mut agent_text_len: usize = 0;
        let mut full_text = String::new();
        let execution_start = std::time::Instant::now();
        let execution_timeout = std::time::Duration::from_secs(300);

        loop {
            iteration += 1;

            if execution_start.elapsed() >= execution_timeout {
                tracing::warn!("Global execution timeout (300s) reached at iteration {}", iteration);
                let _ = tx.send(serde_json::to_string(&json!({
                    "token": "\n[Execution timeout — 5 minutes reached]",
                    "done": true, "model": &model, "total_tokens": 0,
                })).unwrap_or_default()).await;
                break;
            }

            if iteration > max_tool_iterations {
                let _ = tx.send(serde_json::to_string(&json!({
                    "token": "\n[Max tool iterations reached]",
                    "done": true, "model": &model, "total_tokens": 0,
                })).unwrap_or_default()).await;
                break;
            }

            let mut body = json!({
                "model": &model,
                "max_tokens": max_tokens,
                "system": &system_prompt,
                "messages": &conversation,
                "tools": &tool_defs,
                "stream": true,
                "temperature": effective_temperature,
            });

            sanitize_json_strings(&mut body);

            let resp = match send_to_anthropic(&state_clone, &body, 300).await {
                Ok(r) => r,
                Err((_, Json(err_val))) => {
                    let err_msg = err_val.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                    let _ = tx.send(serde_json::to_string(&json!({
                        "token": format!("\n[API error: {}]", err_msg),
                        "done": true, "model": &model, "total_tokens": 0,
                    })).unwrap_or_default()).await;
                    break;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status();
                let err_text = resp.text().await.unwrap_or_default();
                tracing::error!("Anthropic API error (status={}, iteration={}): {}", status, iteration, &err_text[..err_text.len().min(500)]);
                let _ = tx.send(serde_json::to_string(&json!({
                    "token": format!("\n[Anthropic error: {}]", err_text),
                    "done": true, "model": &model, "total_tokens": 0,
                })).unwrap_or_default()).await;
                break;
            }

            // Parse SSE stream — collect content blocks
            let mut text_content = String::new();
            let mut tool_uses: Vec<Value> = Vec::new();
            let mut current_tool_id = String::new();
            let mut current_tool_name = String::new();
            let mut current_tool_input_json = String::new();
            let mut in_tool_use = false;
            let mut stop_reason = String::new();
            let mut total_tokens: u32 = 0;

            let mut byte_stream = resp.bytes_stream();
            let mut raw_buf: Vec<u8> = Vec::new();

            while let Some(chunk_result) = byte_stream.next().await {
                let chunk = match chunk_result {
                    Ok(bytes) => bytes,
                    Err(_) => break,
                };

                raw_buf.extend_from_slice(&chunk);

                while let Some(newline_pos) = raw_buf.iter().position(|&b| b == b'\n') {
                    let line_bytes = raw_buf[..newline_pos].to_vec();
                    raw_buf = raw_buf[newline_pos + 1..].to_vec();
                    let line = String::from_utf8_lossy(&line_bytes).trim().to_string();

                    if line.is_empty() || line.starts_with(':') { continue; }

                    let data = match line.strip_prefix("data: ") {
                        Some(d) if d != "[DONE]" => d,
                        _ => continue,
                    };

                    let event: Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };

                    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    match event_type {
                        "content_block_start" => {
                            let cb = event.get("content_block").unwrap_or(&Value::Null);
                            let cb_type = cb.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            if cb_type == "tool_use" {
                                in_tool_use = true;
                                current_tool_id = cb.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                current_tool_name = cb.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                current_tool_input_json.clear();
                            }
                        }
                        "content_block_delta" => {
                            let delta = event.get("delta").unwrap_or(&Value::Null);
                            let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            if delta_type == "text_delta" {
                                let text = delta.get("text").and_then(|t| t.as_str()).unwrap_or("");
                                if !text.is_empty() {
                                    text_content.push_str(text);
                                    full_text.push_str(text);
                                    agent_text_len += text.len();
                                    let _ = tx.send(serde_json::to_string(&json!({
                                        "token": text, "done": false,
                                    })).unwrap_or_default()).await;
                                }
                            } else if delta_type == "input_json_delta" {
                                let partial = delta.get("partial_json").and_then(|t| t.as_str()).unwrap_or("");
                                current_tool_input_json.push_str(partial);
                            }
                        }
                        "content_block_stop" => {
                            if in_tool_use {
                                let tool_input: Value = serde_json::from_str(&current_tool_input_json).unwrap_or(json!({}));
                                let _ = tx.send(serde_json::to_string(&json!({
                                    "type": "tool_call",
                                    "tool_use_id": &current_tool_id,
                                    "tool_name": &current_tool_name,
                                    "tool_input": &tool_input,
                                })).unwrap_or_default()).await;
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
                            if let Some(sr) = event.get("delta").and_then(|d| d.get("stop_reason")).and_then(|s| s.as_str()) {
                                stop_reason = sr.to_string();
                            }
                            if let Some(usage) = event.get("usage") {
                                total_tokens = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                            }
                        }
                        _ => {}
                    }
                }
            }

            // After stream completes — check stop_reason
            if stop_reason == "tool_use" && !tool_uses.is_empty() {
                let mut assistant_blocks: Vec<Value> = Vec::new();
                if !text_content.is_empty() {
                    assistant_blocks.push(json!({ "type": "text", "text": &text_content }));
                }
                assistant_blocks.extend(tool_uses.clone());
                conversation.push(json!({ "role": "assistant", "content": assistant_blocks }));

                // Execute each tool
                let mut tool_results: Vec<Value> = Vec::new();
                for tu in &tool_uses {
                    let tool_name = tu.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let tool_id = tu.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let empty_input = json!({});
                    let tool_input = tu.get("input").unwrap_or(&empty_input);

                    let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                    let executor = state_clone.tool_executor.with_working_directory(&wd);
                    let (result, is_error) = match tokio::time::timeout(
                        timeout,
                        executor.execute_with_state(tool_name, tool_input, &state_clone),
                    ).await {
                        Ok(res) => res,
                        Err(_) => {
                            tracing::warn!("Tool '{}' timed out after {}s", tool_name, TOOL_TIMEOUT_SECS);
                            (format!("Tool '{}' timed out after {}s", tool_name, TOOL_TIMEOUT_SECS), true)
                        }
                    };

                    if !is_error && (tool_name == "write_file" || tool_name == "edit_file") {
                        has_written_file = true;
                    }

                    let context_limit = if iteration < 3 { 25000 } else if iteration < 6 { 15000 } else { 8000 };
                    let truncated_result = truncate_for_context_with_limit(&result, context_limit);

                    let _ = tx.send(serde_json::to_string(&json!({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "result": &result,
                        "is_error": is_error,
                    })).unwrap_or_default()).await;

                    tool_results.push(json!({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": &truncated_result,
                        "is_error": is_error,
                    }));
                }

                conversation.push(json!({ "role": "user", "content": tool_results }));

                // Iteration nudges
                if iteration >= 3 {
                    let approx_context_bytes: usize = conversation.iter()
                        .map(|c| serde_json::to_string(c).map(|s| s.len()).unwrap_or(0))
                        .sum();
                    let context_hint = format!(
                        "[CONTEXT: ~{}KB, {} msgs, iter {}/{}]",
                        approx_context_bytes / 1024, conversation.len(), iteration, max_tool_iterations
                    );
                    let nudge = if iteration >= 12 {
                        format!("[SYSTEM: Approaching limit. {} Wrap up and apply any pending changes.]", context_hint)
                    } else if iteration >= 8 {
                        format!("[SYSTEM: {} Consider applying edits now.]", context_hint)
                    } else {
                        format!("[SYSTEM: {} {} iterations remaining.]", context_hint, max_tool_iterations - iteration)
                    };
                    conversation.push(json!({ "role": "user", "content": nudge }));
                }

                text_content.clear();
                continue;
            }

            // Auto-fix phase
            if !has_written_file && !full_text.is_empty() && agent_text_len > 50 {
                let fix_keywords = ["fix", "napraw", "zmian", "popraw", "zastosow",
                                    "write_file", "edit_file", "zmieni", "edytu", "zapisa"];
                let lower = full_text.to_lowercase();
                let needs_fix = fix_keywords.iter().any(|kw| lower.contains(kw));

                if needs_fix {
                    tracing::info!("Auto-fix phase — agent described changes but never wrote files");
                    let edit_tools: Vec<&Value> = tool_defs.iter().filter(|td| {
                        let name = td.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        name == "edit_file" || name == "write_file"
                    }).collect();

                    if !edit_tools.is_empty() {
                        conversation.push(json!({
                            "role": "user",
                            "content": "[SYSTEM: You described changes but never applied them. Use edit_file or write_file NOW to apply the changes you described. Do not explain — just make the edits.]"
                        }));

                        let fix_body = json!({
                            "model": &model,
                            "max_tokens": max_tokens,
                            "system": &system_prompt,
                            "messages": &conversation,
                            "tools": &edit_tools,
                            "stream": false,
                        });

                        if let Ok(fix_resp) = send_to_anthropic(&state_clone, &fix_body, 60).await {
                            if fix_resp.status().is_success() {
                                if let Ok(fix_json) = fix_resp.json::<Value>().await {
                                    if let Some(content) = fix_json.get("content").and_then(|c| c.as_array()) {
                                        for block in content {
                                            let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                            if block_type == "tool_use" {
                                                let fix_tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                                let empty_input = json!({});
                                                let fix_tool_input = block.get("input").unwrap_or(&empty_input);
                                                let fix_tool_id = block.get("id").and_then(|i| i.as_str()).unwrap_or("");

                                                let executor = state_clone.tool_executor.with_working_directory(&wd);
                                                let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                                                let (result, is_error) = match tokio::time::timeout(
                                                    timeout,
                                                    executor.execute_with_state(fix_tool_name, fix_tool_input, &state_clone),
                                                ).await {
                                                    Ok(res) => res,
                                                    Err(_) => (format!("Tool '{}' timed out", fix_tool_name), true),
                                                };

                                                let _ = tx.send(serde_json::to_string(&json!({
                                                    "type": "tool_call",
                                                    "tool_use_id": fix_tool_id,
                                                    "tool_name": fix_tool_name,
                                                    "tool_input": fix_tool_input,
                                                })).unwrap_or_default()).await;
                                                let _ = tx.send(serde_json::to_string(&json!({
                                                    "type": "tool_result",
                                                    "tool_use_id": fix_tool_id,
                                                    "result": &result,
                                                    "is_error": is_error,
                                                })).unwrap_or_default()).await;

                                                let _ = is_error;
                                            } else if block_type == "text" {
                                                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                                    if !text.is_empty() {
                                                        let _ = tx.send(serde_json::to_string(&json!({
                                                            "token": text, "done": false,
                                                        })).unwrap_or_default()).await;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Forced synthesis — if agent produced very little text
            if agent_text_len < 100 && !full_text.is_empty() {
                tracing::info!("Forced synthesis — agent produced {}B text, requesting summary", agent_text_len);
                conversation.push(json!({ "role": "assistant", "content": &full_text }));
                conversation.push(json!({
                    "role": "user",
                    "content": "[SYSTEM: Summarize what you did. Be concise but list all changes made.]"
                }));

                let synth_body = json!({
                    "model": &model,
                    "max_tokens": 1024_u32,
                    "system": &system_prompt,
                    "messages": &conversation,
                    "stream": true,
                });

                if let Ok(synth_resp) = send_to_anthropic(&state_clone, &synth_body, 30).await {
                    if synth_resp.status().is_success() {
                        let mut synth_stream = synth_resp.bytes_stream();
                        let mut synth_buf: Vec<u8> = Vec::new();
                        while let Some(Ok(chunk)) = synth_stream.next().await {
                            synth_buf.extend_from_slice(&chunk);
                            while let Some(nl) = synth_buf.iter().position(|&b| b == b'\n') {
                                let line_bytes = synth_buf[..nl].to_vec();
                                synth_buf = synth_buf[nl + 1..].to_vec();
                                let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                                if let Some(data) = line.strip_prefix("data: ") {
                                    if data == "[DONE]" { continue; }
                                    if let Ok(ev) = serde_json::from_str::<Value>(data) {
                                        if let Some(text) = ev.pointer("/delta/text").and_then(|t| t.as_str()) {
                                            if !text.is_empty() {
                                                let _ = tx.send(serde_json::to_string(&json!({
                                                    "token": text, "done": false,
                                                })).unwrap_or_default()).await;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // stop_reason == "end_turn" or other — emit done
            let _ = tx.send(serde_json::to_string(&json!({
                "token": "", "done": true, "model": &model, "total_tokens": total_tokens,
            })).unwrap_or_default()).await;
            break;
        }
    });

    // Convert channel receiver into a byte stream with SSE heartbeat
    let ndjson_stream = async_stream::stream! {
        let mut rx = rx;
        let heartbeat_interval = std::time::Duration::from_secs(15);
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Some(line) => {
                            yield Ok::<_, std::io::Error>(axum::body::Bytes::from(format!("{}\n", line)));
                        }
                        None => break,
                    }
                }
                _ = tokio::time::sleep(heartbeat_interval) => {
                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from_static(b": heartbeat\n\n"));
                }
            }
        }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(ndjson_stream))
        .expect("Response builder with valid status and headers"))
}

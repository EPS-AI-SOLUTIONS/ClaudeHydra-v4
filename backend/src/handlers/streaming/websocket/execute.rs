#![allow(clippy::too_many_arguments)]
//! Core WebSocket streaming execution — orchestrator module.
//!
//! Dispatches between the non-tools streaming path and the tools-enabled
//! agentic loop. The actual implementations live in focused sub-modules:
//!
//! - [`execute_stream`] — simple streaming without tool loop (`tools_enabled = false`)
//! - [`execute_batch`]  — auto-fix phase (detects described-but-unapplied edits)
//!
//! This remains CH-specific because:
//! - CH uses its own WsClientMessage/WsServerMessage types (different from jaskier-core)
//! - CH WS handler supports `tools_enabled` toggle (vs OpenAI/Gemini always-tools)
//! - CH WS has unique auto-fix phase and forced synthesis
//! - CancellationToken integration is CH-specific
//!
//! The Anthropic SSE parsing within WS uses the shared `AnthropicSseParser`.

use crate::handlers::streaming::websocket::execute_batch;
use crate::handlers::streaming::websocket::execute_stream;

use axum::Json;
use axum::extract::ws::{Message as WsMessage, WebSocket};
use futures_util::stream::SplitSink;
use serde_json::{Value, json};
use tokio_stream::StreamExt;
use tokio_util::sync::CancellationToken;

use jaskier_core::handlers::anthropic_streaming::{
    AnthropicSseEvent, AnthropicSseParser, build_iteration_nudge, dynamic_max_iterations,
    parse_sse_lines, sanitize_api_error, tool_result_context_limit, trim_conversation,
    truncate_for_context_with_limit as truncate_tool_output,
};

use crate::models::*;
use crate::state::AppState;

use crate::handlers::prompt::resolve_chat_context;
use crate::handlers::streaming::agent_call::execute_agent_call;
use crate::handlers::streaming::helpers::{
    detect_view_hints, load_session_history, store_ws_messages,
};
use crate::handlers::streaming::{
    TOOL_TIMEOUT_SECS, sanitize_json_strings, send_to_anthropic, truncate_for_context_with_limit,
};

use super::ws_send;

/// Core WebSocket streaming execution with rich protocol.
///
/// Resolves chat context (model, settings, session history), then dispatches
/// to either the no-tools streaming path or the agentic tool-use loop.
pub(crate) async fn execute_streaming_ws(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    prompt: String,
    model_override: Option<String>,
    tools_enabled: bool,
    session_id: Option<String>,
    cancel: CancellationToken,
) {
    let execution_start = std::time::Instant::now();
    let execution_id = uuid::Uuid::new_v4().to_string();

    // Build a ChatRequest for resolve_chat_context
    let chat_req = ChatRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt.clone(),
            model: None,
            timestamp: None,
        }],
        model: model_override,
        temperature: None,
        max_tokens: None,
        stream: Some(true),
        tools_enabled: Some(tools_enabled),
        session_id: session_id.clone(),
    };

    let ctx = resolve_chat_context(state, &chat_req).await;
    let model = ctx.model;
    let max_tokens = ctx.max_tokens;
    let effective_temperature = ctx.temperature;
    let wd = ctx.working_directory;
    let system_prompt = ctx.system_prompt;

    // Dynamic iteration cap
    let prompt_len = prompt.len();
    let max_tool_iterations: usize =
        dynamic_max_iterations(prompt_len).min(ctx.max_iterations.max(1) as usize);

    // Send Start
    ws_send(
        sender,
        &WsServerMessage::Start {
            id: execution_id.clone(),
            model: model.clone(),
            files_loaded: vec![],
        },
    )
    .await;

    // Predictive UI pre-fetching — emit view hints based on prompt keywords
    let view_hints = detect_view_hints(&prompt);
    if !view_hints.is_empty() {
        ws_send(sender, &WsServerMessage::ViewHint { views: view_hints }).await;
    }

    // Build initial messages — prefer DB history when session_id present
    let initial_messages: Vec<Value> = if let Some(ref sid) = ctx.session_id {
        let mut history = load_session_history(&state.db, sid).await;
        history.push(json!({ "role": "user", "content": &prompt }));
        history
    } else {
        vec![json!({ "role": "user", "content": &prompt })]
    };

    // Non-tools path: simple streaming without tool loop
    if !tools_enabled {
        execute_stream::execute_no_tools(
            sender,
            state,
            &model,
            max_tokens,
            effective_temperature,
            &system_prompt,
            &initial_messages,
            &prompt,
            &ctx.session_id,
            execution_start,
            &cancel,
        )
        .await;
        return;
    }

    // ── Tools-enabled path: agentic tool_use loop ───────────────────────
    execute_with_tools(
        sender,
        state,
        &model,
        max_tokens,
        effective_temperature,
        &system_prompt,
        initial_messages,
        &prompt,
        &ctx.session_id,
        &wd,
        max_tool_iterations,
        execution_start,
        &cancel,
    )
    .await;
}

/// Tools-enabled path: agentic tool_use loop.
///
/// Runs the Anthropic tool-use loop: each iteration calls the Anthropic API,
/// parses SSE events via `AnthropicSseParser`, executes tool calls in parallel,
/// and feeds results back until the model stops requesting tools or the
/// iteration/timeout limit is reached.
#[allow(clippy::too_many_arguments)]
async fn execute_with_tools(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    model: &str,
    max_tokens: u32,
    effective_temperature: f64,
    system_prompt: &str,
    initial_messages: Vec<Value>,
    prompt: &str,
    session_id: &Option<uuid::Uuid>,
    wd: &str,
    max_tool_iterations: usize,
    execution_start: std::time::Instant,
    cancel: &CancellationToken,
) {
    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(state, Some(model))
        .await
        .into_iter()
        .map(|td| {
            json!({
                "name": td.name,
                "description": td.description,
                "input_schema": td.input_schema,
            })
        })
        .collect();

    let mut conversation: Vec<Value> = initial_messages;
    let mut iteration: u32 = 0;
    let mut has_written_file = false;
    let mut agent_text_len: usize = 0;
    let mut full_text = String::new();
    let execution_timeout = std::time::Duration::from_secs(300);

    loop {
        iteration += 1;

        if cancel.is_cancelled() {
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Cancelled by user".to_string(),
                    code: Some("CANCELLED".to_string()),
                },
            )
            .await;
            break;
        }

        if execution_start.elapsed() >= execution_timeout {
            tracing::warn!(
                "WS: Global execution timeout (300s) at iteration {}",
                iteration
            );
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Execution timeout — 5 minutes reached".to_string(),
                    code: Some("TIMEOUT".to_string()),
                },
            )
            .await;
            break;
        }

        if iteration > max_tool_iterations as u32 {
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Max tool iterations reached".to_string(),
                    code: Some("MAX_ITERATIONS".to_string()),
                },
            )
            .await;
            break;
        }

        // Send Iteration progress
        ws_send(
            sender,
            &WsServerMessage::Iteration {
                number: iteration,
                max: max_tool_iterations as u32,
            },
        )
        .await;

        let mut body = json!({
            "model": model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": &conversation,
            "tools": &tool_defs,
            "stream": true,
            "temperature": effective_temperature,
        });
        sanitize_json_strings(&mut body);

        let resp = match send_to_anthropic(state, &body, 300).await {
            Ok(r) => r,
            Err((_, Json(err_val))) => {
                let raw_msg = err_val
                    .get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("Unknown error");
                tracing::error!(
                    "WS: send_to_anthropic failed (tool loop, iter={}): {}",
                    iteration,
                    raw_msg
                );
                ws_send(
                    sender,
                    &WsServerMessage::Error {
                        message: "AI provider request failed".to_string(),
                        code: Some("API_ERROR".to_string()),
                    },
                )
                .await;
                break;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            tracing::error!(
                "WS: Anthropic API error (status={}, iter={}): {}",
                status,
                iteration,
                &truncate_for_context_with_limit(&err_text, 500)
            );
            let safe_error = sanitize_api_error(&err_text);
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: safe_error,
                    code: Some("ANTHROPIC_ERROR".to_string()),
                },
            )
            .await;
            break;
        }

        // Parse Anthropic SSE stream using shared parser
        let mut parser = AnthropicSseParser::new();
        let mut text_content = String::new();
        let mut tool_uses: Vec<Value> = Vec::new();
        let mut stop_reason = String::new();
        let mut _total_tokens: u32 = 0;

        let mut byte_stream = resp.bytes_stream();
        let mut raw_buf: Vec<u8> = Vec::new();

        while let Some(chunk_result) = byte_stream.next().await {
            if cancel.is_cancelled() {
                break;
            }

            let chunk = match chunk_result {
                Ok(bytes) => bytes,
                Err(_) => break,
            };
            raw_buf.extend_from_slice(&chunk);

            let sse_events = parse_sse_lines(&mut raw_buf);
            for sse_json in sse_events {
                let parsed = parser.parse_event(&sse_json);
                for ev in parsed {
                    match ev {
                        AnthropicSseEvent::TextToken(text) => {
                            text_content.push_str(&text);
                            full_text.push_str(&text);
                            agent_text_len += text.len();
                            ws_send(sender, &WsServerMessage::Token { content: text }).await;
                        }
                        AnthropicSseEvent::ToolUse { id, name, input } => {
                            ws_send(
                                sender,
                                &WsServerMessage::ToolCall {
                                    name: name.clone(),
                                    args: input.clone(),
                                    iteration,
                                },
                            )
                            .await;
                            tool_uses.push(json!({
                                "type": "tool_use",
                                "id": &id,
                                "name": &name,
                                "input": input,
                            }));
                        }
                        AnthropicSseEvent::StopReason(sr) => {
                            stop_reason = sr;
                        }
                        AnthropicSseEvent::TokenUsage(tokens) => {
                            _total_tokens = tokens;
                        }
                        AnthropicSseEvent::MessageStop => {}
                    }
                }
            }
        }

        if cancel.is_cancelled() {
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Cancelled by user".to_string(),
                    code: Some("CANCELLED".to_string()),
                },
            )
            .await;
            break;
        }

        // Tool execution
        if stop_reason == "tool_use" && !tool_uses.is_empty() {
            let mut assistant_blocks: Vec<Value> = Vec::new();
            if !text_content.is_empty() {
                assistant_blocks.push(json!({ "type": "text", "text": &text_content }));
            }
            assistant_blocks.extend(tool_uses.clone());
            conversation.push(json!({ "role": "assistant", "content": assistant_blocks }));

            let tools_total = tool_uses.len() as u32;
            let mut tool_results: Vec<Value> = Vec::new();
            let mut tools_completed: u32 = 0;

            // Execute tools in parallel via tokio::spawn
            let mut handles = Vec::new();
            let mut pending_tool_ids: Vec<String> = Vec::new();
            for tu in &tool_uses {
                let tool_name = tu
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                let tool_id = tu
                    .get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();
                pending_tool_ids.push(tool_id.clone());
                let tool_input = tu.get("input").unwrap_or(&json!({})).clone();
                let executor = state.tool_executor.with_working_directory(wd);
                let state_ref = state.clone();
                let wd_ref = wd.to_string();

                let semaphore = state.a2a_semaphore.clone();
                let handle = tokio::spawn(async move {
                    let (result, is_error) = if tool_name == "call_agent" {
                        // Acquire A2A concurrency permit
                        match semaphore.acquire_owned().await {
                            Err(_) => (
                                "A2A delegation limit reached — semaphore closed".to_string(),
                                true,
                            ),
                            Ok(_permit) => {
                                match tokio::time::timeout(
                                    std::time::Duration::from_secs(120),
                                    execute_agent_call(&state_ref, &tool_input, &wd_ref, 0),
                                )
                                .await
                                {
                                    Ok(res) => res,
                                    Err(_) => {
                                        ("Agent delegation timed out after 120s".to_string(), true)
                                    }
                                }
                            }
                        }
                    } else {
                        let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                        match tokio::time::timeout(
                            timeout,
                            executor.execute_with_state(&tool_name, &tool_input, &state_ref),
                        )
                        .await
                        {
                            Ok(res) => res,
                            Err(_) => (
                                format!(
                                    "Tool '{}' timed out after {}s",
                                    tool_name, TOOL_TIMEOUT_SECS
                                ),
                                true,
                            ),
                        }
                    };
                    (tool_name, tool_id, result, is_error)
                });
                handles.push(handle);
            }

            // Collect results with heartbeat during long tool execution
            for (handle_idx, mut handle) in handles.into_iter().enumerate() {
                let heartbeat_dur = std::time::Duration::from_secs(15);
                let result = loop {
                    tokio::select! {
                        result = &mut handle => break result,
                        _ = tokio::time::sleep(heartbeat_dur) => {
                            ws_send(sender, &WsServerMessage::Heartbeat).await;
                        }
                    }
                };

                match result {
                    Ok((tool_name, tool_id, result, is_error)) => {
                        tools_completed += 1;
                        if !is_error && (tool_name == "write_file" || tool_name == "edit_file") {
                            has_written_file = true;
                        }

                        let summary: String = result.chars().take(200).collect();
                        ws_send(
                            sender,
                            &WsServerMessage::ToolResult {
                                name: tool_name.clone(),
                                success: !is_error,
                                summary,
                                iteration,
                            },
                        )
                        .await;

                        ws_send(
                            sender,
                            &WsServerMessage::ToolProgress {
                                iteration,
                                tools_completed,
                                tools_total,
                            },
                        )
                        .await;

                        let truncated =
                            truncate_tool_output(&result, tool_result_context_limit(iteration));
                        tool_results.push(json!({
                            "type": "tool_result",
                            "tool_use_id": &tool_id,
                            "content": &truncated,
                            "is_error": is_error,
                        }));
                    }
                    Err(e) => {
                        tracing::error!("Tool task panicked: {}", e);
                        tools_completed += 1;
                        tool_results.push(json!({
                            "type": "tool_result",
                            "tool_use_id": &pending_tool_ids[handle_idx],
                            "content": "Tool execution panicked — internal error",
                            "is_error": true,
                        }));
                    }
                }
            }

            conversation.push(json!({ "role": "user", "content": tool_results }));

            // Sliding window: trim conversation to stay within context limits
            trim_conversation(&mut conversation);

            // Iteration nudges for final iterations
            if let Some(nudge) =
                build_iteration_nudge(iteration, max_tool_iterations as u32, &conversation)
            {
                conversation.push(json!({ "role": "user", "content": nudge }));
            }

            text_content.clear();
            continue;
        }

        // Auto-fix phase: agent described changes but never wrote files
        if !has_written_file && !full_text.is_empty() && agent_text_len > 50 {
            execute_batch::execute_auto_fix(
                sender,
                state,
                model,
                max_tokens,
                system_prompt,
                &conversation,
                &tool_defs,
                wd,
                iteration,
            )
            .await;
        }

        // Store messages if session present
        if let Some(sid) = session_id {
            let _ = store_ws_messages(state, sid, prompt, &full_text).await;
        }

        // Complete
        ws_send(
            sender,
            &WsServerMessage::Complete {
                duration_ms: execution_start.elapsed().as_millis() as u64,
            },
        )
        .await;
        break;
    }
}

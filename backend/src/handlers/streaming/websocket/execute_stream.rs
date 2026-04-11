//! Non-tools streaming path for WebSocket execution.
//!
//! Handles the simple case where `tools_enabled = false`: sends a single
//! Anthropic streaming request, forwards SSE tokens to the WebSocket client,
//! and supports model fallback on 429/5xx responses.

use axum::Json;
use axum::extract::ws::{Message as WsMessage, WebSocket};
use futures_util::stream::SplitSink;
use serde_json::{Value, json};
use tokio_stream::StreamExt;
use tokio_util::sync::CancellationToken;

use jaskier_core::handlers::anthropic_streaming::{parse_sse_lines, sanitize_api_error};

use crate::models::*;
use crate::state::AppState;

use crate::handlers::streaming::helpers::store_ws_messages;
use crate::handlers::streaming::{
    is_retryable_status, sanitize_json_strings, send_to_anthropic, truncate_for_context_with_limit,
};

use super::ws_send;

/// Non-tools path: simple streaming without tool loop.
///
/// Builds a single Anthropic API request, streams tokens to the WebSocket
/// client via `Token` messages, and persists the response to the session DB.
/// Falls back to cheaper models on 429/5xx before giving up.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn execute_no_tools(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    model: &str,
    max_tokens: u32,
    effective_temperature: f64,
    system_prompt: &str,
    initial_messages: &[Value],
    prompt: &str,
    session_id: &Option<uuid::Uuid>,
    execution_start: std::time::Instant,
    cancel: &CancellationToken,
) {
    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": initial_messages,
        "stream": true,
    });
    if effective_temperature > 0.0 {
        body["temperature"] = json!(effective_temperature);
    }
    sanitize_json_strings(&mut body);

    let resp = match send_to_anthropic(state, &body, 300).await {
        Ok(r) => r,
        Err((_, Json(err_val))) => {
            let raw_msg = err_val
                .get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("Unknown error");
            tracing::error!("WS: send_to_anthropic failed (no-tools): {}", raw_msg);
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "AI provider request failed".to_string(),
                    code: Some("API_ERROR".to_string()),
                },
            )
            .await;
            return;
        }
    };

    // Fallback chain: if rate-limited or 5xx, try cheaper models
    let resp = if !resp.status().is_success() && is_retryable_status(resp.status().as_u16()) {
        let original_status = resp.status();
        let fallback_models = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
        let mut fallback_resp = None;
        for fb_model in &fallback_models {
            if *fb_model == model {
                continue;
            }
            tracing::warn!(
                "ws: {} returned {}, falling back to {}",
                model,
                original_status,
                fb_model
            );
            body["model"] = json!(fb_model);
            if let Ok(fb) = send_to_anthropic(state, &body, 300).await
                && fb.status().is_success()
            {
                let reason = if original_status.as_u16() == 429 {
                    "rate_limited"
                } else {
                    "server_error"
                };
                ws_send(
                    sender,
                    &WsServerMessage::Fallback {
                        from: model.to_string(),
                        to: fb_model.to_string(),
                        reason: reason.to_string(),
                    },
                )
                .await;
                fallback_resp = Some(fb);
                break;
            }
        }
        fallback_resp.unwrap_or(resp)
    } else {
        resp
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        tracing::error!(
            "WS: Anthropic API error after fallback (status={}): {}",
            status,
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
        return;
    }

    // Parse SSE -> Token messages (using shared parser)
    let mut byte_stream = resp.bytes_stream();
    let mut raw_buf: Vec<u8> = Vec::new();
    let mut full_text = String::new();

    while let Some(chunk_result) = byte_stream.next().await {
        if cancel.is_cancelled() {
            ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Cancelled by user".to_string(),
                    code: Some("CANCELLED".to_string()),
                },
            )
            .await;
            return;
        }
        let chunk = match chunk_result {
            Ok(bytes) => bytes,
            Err(_) => break,
        };
        raw_buf.extend_from_slice(&chunk);

        let events = parse_sse_lines(&mut raw_buf);
        for event in events {
            let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if event_type == "content_block_delta" {
                let text = event
                    .get("delta")
                    .and_then(|d| d.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                if !text.is_empty() {
                    full_text.push_str(text);
                    ws_send(
                        sender,
                        &WsServerMessage::Token {
                            content: text.to_string(),
                        },
                    )
                    .await;
                }
            }
        }
    }

    // Store message to DB if session present
    if let Some(sid) = session_id {
        let _ = store_ws_messages(state, sid, prompt, &full_text).await;
    }

    ws_send(
        sender,
        &WsServerMessage::Complete {
            duration_ms: execution_start.elapsed().as_millis() as u64,
        },
    )
    .await;
}

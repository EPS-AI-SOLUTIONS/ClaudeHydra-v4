//! Auto-fix phase for WebSocket streaming execution.
//!
//! Detects when an agent described file changes in natural language but never
//! actually called `write_file` / `edit_file`, then issues a correction prompt
//! to force the agent to apply the changes using tool calls.

use axum::extract::ws::{Message as WsMessage, WebSocket};
use futures_util::stream::SplitSink;
use serde_json::{Value, json};

use crate::models::*;
use crate::state::AppState;

use super::ws_send;
use crate::handlers::streaming::{TOOL_TIMEOUT_SECS, sanitize_json_strings, send_to_anthropic};

/// Auto-fix phase — detects when agent described changes but never wrote files.
///
/// Scans assistant turns in the conversation for keywords that indicate the
/// model described edits without applying them (e.g. "fix", "napraw", "zmień").
/// When detected, sends a non-streaming Anthropic request restricted to
/// `edit_file` / `write_file` tools and executes any resulting tool calls.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn execute_auto_fix(
    sender: &mut SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    model: &str,
    max_tokens: u32,
    system_prompt: &str,
    conversation: &[Value],
    tool_defs: &[Value],
    wd: &str,
    iteration: u32,
) {
    // Check if assistant text mentions fix/edit keywords
    let full_text: String = conversation
        .iter()
        .filter_map(|m| {
            if m.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                m.get("content").and_then(|c| c.as_str()).map(String::from)
            } else {
                None
            }
        })
        .collect();

    let fix_keywords = [
        "fix",
        "napraw",
        "zmian",
        "popraw",
        "zastosow",
        "write_file",
        "edit_file",
        "zmieni",
        "edytu",
        "zapisa",
    ];
    let lower = full_text.to_lowercase();
    let needs_fix = fix_keywords.iter().any(|kw| lower.contains(kw));

    if !needs_fix {
        return;
    }

    tracing::info!("WS: Auto-fix phase — agent described changes but never wrote files");

    // Filter tool_defs to only edit/write tools
    let edit_tools: Vec<&Value> = tool_defs
        .iter()
        .filter(|td| {
            let name = td.get("name").and_then(|n| n.as_str()).unwrap_or("");
            name == "edit_file" || name == "write_file"
        })
        .collect();

    if edit_tools.is_empty() {
        return;
    }

    let mut fix_conversation = conversation.to_vec();
    fix_conversation.push(json!({
        "role": "user",
        "content": "[SYSTEM: You described changes but never applied them. Use edit_file or write_file NOW to apply the changes you described. Do not explain — just make the edits.]"
    }));

    let mut fix_body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": &fix_conversation,
        "tools": &edit_tools,
        "stream": false,
    });
    sanitize_json_strings(&mut fix_body);

    if let Ok(fix_resp) = send_to_anthropic(state, &fix_body, 60).await
        && fix_resp.status().is_success()
        && let Ok(fix_json) = fix_resp.json::<Value>().await
        && let Some(content) = fix_json.get("content").and_then(|c| c.as_array())
    {
        for block in content {
            let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if block_type == "tool_use" {
                let fix_tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let empty_input = json!({});
                let fix_tool_input = block.get("input").unwrap_or(&empty_input);
                let executor = state.tool_executor.with_working_directory(wd);
                let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                let (result, is_error) = match tokio::time::timeout(
                    timeout,
                    executor.execute_with_state(fix_tool_name, fix_tool_input, state),
                )
                .await
                {
                    Ok(res) => res,
                    Err(_) => (format!("Tool '{}' timed out", fix_tool_name), true),
                };

                ws_send(
                    sender,
                    &WsServerMessage::ToolCall {
                        name: fix_tool_name.to_string(),
                        args: fix_tool_input.clone(),
                        iteration,
                    },
                )
                .await;
                let summary: String = result.chars().take(200).collect();
                ws_send(
                    sender,
                    &WsServerMessage::ToolResult {
                        name: fix_tool_name.to_string(),
                        success: !is_error,
                        summary,
                        iteration,
                    },
                )
                .await;
            } else if block_type == "text"
                && let Some(text) = block.get("text").and_then(|t| t.as_str())
                && !text.is_empty()
            {
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

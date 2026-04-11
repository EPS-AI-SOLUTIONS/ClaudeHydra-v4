//! Handler modules for ClaudeHydra v4 API.
//!
//! Split from monolithic `handlers.rs` into focused sub-modules:
//! - `anthropic_client` — Anthropic API credential resolution, request building, retry logic
//! - `prompt` — system prompt construction, chat context resolution, auto-tier routing
//! - `streaming` — NDJSON streaming handlers (Anthropic SSE + Gemini hybrid)
//! - `chat` — non-streaming Claude chat endpoints
//! - `health` — health, readiness, system stats, auth mode, admin
//! - `sessions` — session CRUD, messages, AI title generation
//! - `settings` — application settings endpoints
//! - `agents` — agent listing and refresh
//! - `files` — file listing and native folder browser
//! - `prompt_history` — bash-like prompt recall
//! - `analytics` — agent performance dashboard aggregation endpoints

pub mod agents;
pub mod analytics;
pub mod anthropic_client;
pub mod chat;
pub mod files;
pub mod health;
pub mod prompt;
pub mod prompt_history;
pub mod sessions;
pub mod settings;
pub mod streaming;
pub mod tags;

// Re-export everything (including utoipa __path_* types needed by OpenApi derive)
pub use agents::*;
pub use analytics::*;
// Re-export send_to_anthropic within the crate so sub-modules (chat, streaming)
// can continue to use `super::send_to_anthropic` without path changes.
pub(crate) use anthropic_client::send_to_anthropic;
pub use chat::*;
pub use files::*;
pub use health::*;
pub use prompt::warm_prompt_cache;
pub use prompt_history::*;
pub use sessions::*;
pub use settings::*;
pub use streaming::*;
pub use tags::*;

// ── Shared constants ──────────────────────────────────────────────────────

pub(crate) const TOOL_TIMEOUT_SECS: u64 = 60;
pub(crate) const MAX_MESSAGE_LENGTH: usize = 100_000;

// ── Shared helpers ────────────────────────────────────────────────────────

use serde_json::Value;

/// Check if an HTTP status code is retryable (429 Too Many Requests or 5xx).
pub(crate) fn is_retryable_status(status: u16) -> bool {
    status == 429 || (500..=599).contains(&status)
}

/// UTF-8 safe truncation for context window limits.
pub(crate) fn truncate_for_context_with_limit(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }
    let boundary = text
        .char_indices()
        .take_while(|(idx, _)| *idx < max_chars)
        .last()
        .map(|(idx, c)| idx + c.len_utf8())
        .unwrap_or(max_chars.min(text.len()));
    format!(
        "{}... [truncated, {} chars total]",
        &text[..boundary],
        text.len()
    )
}

/// Sanitize JSON strings — remove null bytes and BOM that break API calls.
pub(crate) fn sanitize_json_strings(value: &mut Value) {
    match value {
        Value::String(s) => {
            *s = s.replace(['\0', '\u{FEFF}'], "");
        }
        Value::Array(arr) => {
            for v in arr {
                sanitize_json_strings(v);
            }
        }
        Value::Object(map) => {
            for v in map.values_mut() {
                sanitize_json_strings(v);
            }
        }
        _ => {}
    }
}

// ── Anthropic API helpers are now in `anthropic_client` sub-module ──────────
// All credential resolution, request building, and circuit-breaker retry logic
// has been extracted to `handlers/anthropic_client.rs` and re-exported above.

//! WebSocket protocol message types — Jaskier Shared Pattern.
//!
//! Defines the bidirectional WebSocket protocol used by ClaudeHydra's
//! `/ws/chat` endpoint. Messages are tagged JSON (snake_case variant names).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Messages sent from the frontend client to the backend via WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsClientMessage {
    /// Start a new chat execution.
    Execute {
        prompt: String,
        #[serde(default)]
        model: Option<String>,
        #[serde(default)]
        tools_enabled: Option<bool>,
        #[serde(default)]
        session_id: Option<String>,
    },
    /// Cancel the currently running execution.
    Cancel,
    /// Heartbeat ping — expects a `Pong` response.
    Ping,
}

/// Messages sent from the backend to the frontend client via WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsServerMessage {
    /// Execution has started.
    Start {
        id: String,
        model: String,
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        files_loaded: Vec<String>,
    },
    /// A streamed text token.
    Token { content: String },
    /// Execution completed successfully.
    Complete { duration_ms: u64 },
    /// A tool call has been initiated.
    ToolCall {
        name: String,
        args: Value,
        iteration: u32,
    },
    /// A tool call has completed.
    ToolResult {
        name: String,
        success: bool,
        summary: String,
        iteration: u32,
    },
    /// Progress update for parallel tool execution.
    ToolProgress {
        iteration: u32,
        tools_completed: u32,
        tools_total: u32,
    },
    /// Current iteration in the tool-use loop.
    Iteration { number: u32, max: u32 },
    /// An error occurred during execution.
    Error {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },
    /// Heartbeat pong response.
    Pong,
    /// Server-initiated heartbeat to keep the connection alive.
    Heartbeat,
    /// Model fallback occurred (rate-limited or error on primary model).
    Fallback {
        from: String,
        to: String,
        reason: String,
    },
    /// Predictive UI hint — suggests views the user might navigate to next.
    /// Frontend uses these to prefetch lazy-loaded chunks and query data.
    ViewHint { views: Vec<String> },
}

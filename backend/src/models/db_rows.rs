//! Database row types — SQLx `FromRow` structs for raw DB query results.
//!
//! These types are used internally by handler modules to map PostgreSQL rows
//! to Rust values before converting to API response types.

use chrono::{DateTime, Utc};
use serde_json::Value;
use uuid::Uuid;

/// DB row for application settings (ch_settings table).
#[derive(sqlx::FromRow)]
pub struct SettingsRow {
    pub theme: String,
    pub language: String,
    pub default_model: String,
    pub auto_start: bool,
    pub welcome_message: String,
    /// Working directory for filesystem tools (empty = uses ALLOWED_FILE_DIRS / Desktop fallback)
    #[sqlx(default)]
    pub working_directory: String,
    /// Max tool-call iterations per agent request (default 10)
    #[sqlx(default)]
    pub max_iterations: i32,
    /// Temperature for generation (default 0.7)
    #[sqlx(default)]
    pub temperature: f64,
    /// Max output tokens (default 4096)
    #[sqlx(default)]
    pub max_tokens: i32,
    /// Custom instructions injected into system prompt
    #[sqlx(default)]
    pub custom_instructions: String,
    /// Auto-updater enabled
    #[sqlx(default)]
    pub auto_updater: bool,
    /// Telemetry (error reporting) enabled
    #[sqlx(default)]
    pub telemetry: bool,
    /// Message compaction threshold — compact after this many messages (default 25)
    #[sqlx(default)]
    pub compaction_threshold: i32,
    /// Message compaction keep — keep this many recent messages after compaction (default 15)
    #[sqlx(default)]
    pub compaction_keep: i32,
}

/// DB row for a chat session (ch_sessions table).
#[derive(sqlx::FromRow)]
pub struct SessionRow {
    pub id: Uuid,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[sqlx(default)]
    pub working_directory: String,
}

/// Lightweight session row for listing (includes message count, no body).
#[derive(sqlx::FromRow)]
pub struct SessionSummaryRow {
    pub id: Uuid,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub message_count: i64,
    #[sqlx(default)]
    pub working_directory: String,
}

/// DB row for a chat message (ch_messages table).
#[derive(sqlx::FromRow)]
pub struct MessageRow {
    pub id: Uuid,
    pub session_id: Uuid,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// DB row for prompt history (ch_prompt_history table).
#[derive(sqlx::FromRow)]
pub struct PromptHistoryRow {
    pub id: i32,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

/// DB row for tool interactions (ch_tool_interactions table).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ToolInteractionRow {
    pub id: Uuid,
    pub message_id: Uuid,
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: Value,
    pub result: Option<String>,
    pub is_error: bool,
    pub executed_at: DateTime<Utc>,
}

/// DB row for agent configuration (ch_agents_config table).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AgentConfigRow {
    pub id: String,
    pub name: String,
    pub role: String,
    pub tier: String,
    pub status: String,
    pub description: String,
    pub model: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

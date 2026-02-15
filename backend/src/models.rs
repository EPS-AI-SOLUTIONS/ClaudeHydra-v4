use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── DB row types ────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
pub struct SettingsRow {
    pub theme: String,
    pub language: String,
    pub default_model: String,
    pub auto_start: bool,
}

#[derive(sqlx::FromRow)]
pub struct SessionRow {
    pub id: uuid::Uuid,
    pub title: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(sqlx::FromRow)]
pub struct SessionSummaryRow {
    pub id: uuid::Uuid,
    pub title: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub message_count: i64,
}

#[derive(sqlx::FromRow)]
pub struct MessageRow {
    pub id: uuid::Uuid,
    pub session_id: uuid::Uuid,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub agent: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// ── Agent ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitcherAgent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub tier: String,
    pub status: String,
    pub description: String,
    pub model: String,
}

// ── Health ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub app: String,
    pub uptime_seconds: u64,
    pub providers: Vec<ProviderInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub name: String,
    pub available: bool,
}

// ── Chat ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
    pub stream: Option<bool>,
    pub tools_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub message: ChatMessage,
    pub model: String,
    pub usage: Option<UsageInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageInfo {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// ── Claude Models ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeModelInfo {
    pub id: String,
    pub name: String,
    pub tier: String,
    pub provider: String,
    pub available: bool,
}

// ── Settings ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub default_model: String,
    pub auto_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyRequest {
    pub provider: String,
    pub key: String,
}

// ── History ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_interactions: Option<Vec<ToolInteractionInfo>>,
}

// ── Session ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub messages: Vec<HistoryEntry>,
}

/// Lightweight view returned in session listing (no messages body).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddMessageRequest {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_interactions: Option<Vec<ToolInteractionInfo>>,
}

// ── System ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub cpu_usage_percent: f32,
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub platform: String,
}

// ── Tool Use (Anthropic API) ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

/// Content block in an Anthropic message — text, tool_use, or tool_result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },
}

/// A message in the Anthropic conversation format (supports mixed content).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicMessage {
    pub role: String,
    pub content: AnthropicContent,
}

/// Content can be a plain string or a vec of content blocks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AnthropicContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

/// DB row for tool interactions.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ToolInteractionRow {
    pub id: uuid::Uuid,
    pub message_id: uuid::Uuid,
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: Value,
    pub result: Option<String>,
    pub is_error: bool,
    pub executed_at: chrono::DateTime<chrono::Utc>,
}

/// Serializable tool interaction for API responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInteractionInfo {
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: Value,
    pub result: Option<String>,
    pub is_error: bool,
}

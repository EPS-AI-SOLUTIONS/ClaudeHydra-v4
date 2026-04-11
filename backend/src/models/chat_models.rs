//! Chat and session API request/response types.
//!
//! Covers: ChatRequest, ChatMessage, ChatResponse, UsageInfo, SessionSummary,
//! Session, HistoryEntry, ToolInteractionInfo, AppSettings, SystemStats, and
//! related request bodies used by the chat and session handler modules.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

// ── Health ──────────────────────────────────────────────────────────────

/// Response body for the `/api/health` endpoint.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub app: String,
    pub uptime_seconds: u64,
    pub providers: Vec<ProviderInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub browser_proxy: Option<crate::browser_proxy::BrowserProxyStatus>,
}

/// AI provider availability info returned in the health response.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProviderInfo {
    pub name: String,
    pub available: bool,
}

// ── Chat ────────────────────────────────────────────────────────────────

/// Request body for the `POST /api/claude/chat` and streaming endpoints.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
    pub stream: Option<bool>,
    pub tools_enabled: Option<bool>,
    #[serde(default)]
    pub session_id: Option<String>,
}

/// A single chat turn (role + content).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

/// Response body for a completed (non-streaming) chat request.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChatResponse {
    pub id: String,
    pub message: ChatMessage,
    pub model: String,
    pub usage: Option<UsageInfo>,
}

/// Token usage breakdown for a completed chat request.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UsageInfo {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// ── Claude Models ───────────────────────────────────────────────────────

/// Anthropic model descriptor returned by `GET /api/claude/models`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ClaudeModelInfo {
    pub id: String,
    pub name: String,
    pub tier: String,
    pub provider: String,
    pub available: bool,
}

// ── Settings ────────────────────────────────────────────────────────────

/// Application settings as returned/updated by the settings API.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub default_model: String,
    pub auto_start: bool,
    pub welcome_message: String,
    /// Working directory for filesystem tools (empty = uses ALLOWED_FILE_DIRS / Desktop fallback)
    #[serde(default)]
    pub working_directory: String,
    /// Max tool-call iterations per agent request (default 10)
    #[serde(default = "default_max_iterations")]
    pub max_iterations: i32,
    /// Temperature for generation (default 0.7)
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    /// Max output tokens (default 4096)
    #[serde(default = "default_max_tokens")]
    pub max_tokens: i32,
    /// Custom instructions injected into system prompt
    #[serde(default)]
    pub custom_instructions: String,
    /// Auto-updater enabled (check for new versions)
    #[serde(default = "default_true")]
    pub auto_updater: bool,
    /// Telemetry (error reporting) enabled
    #[serde(default)]
    pub telemetry: bool,
    /// Message compaction threshold — compact after this many messages (default 25)
    #[serde(default = "default_compaction_threshold")]
    pub compaction_threshold: i32,
    /// Message compaction keep — keep this many recent messages after compaction (default 15)
    #[serde(default = "default_compaction_keep")]
    pub compaction_keep: i32,
}

fn default_true() -> bool {
    true
}

fn default_max_iterations() -> i32 {
    10
}

fn default_temperature() -> f64 {
    0.7
}

fn default_max_tokens() -> i32 {
    4096
}

fn default_compaction_threshold() -> i32 {
    25
}

fn default_compaction_keep() -> i32 {
    15
}

/// Request body for updating the Anthropic API key.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ApiKeyRequest {
    pub provider: String,
    pub key: String,
}

// ── History ─────────────────────────────────────────────────────────────

/// A single history entry (message + optional tool interactions).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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

/// Full session with all messages (returned by `GET /api/sessions/{id}`).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub messages: Vec<HistoryEntry>,
}

/// Lightweight session descriptor for session listing (no messages body).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub message_count: usize,
    #[serde(default)]
    pub working_directory: String,
}

/// Request body for creating a new session.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateSessionRequest {
    pub title: String,
}

/// Request body for renaming an existing session.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UpdateSessionRequest {
    pub title: String,
}

/// Request body for updating the working directory of a session.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UpdateWorkingDirectoryRequest {
    pub working_directory: String,
}

/// Request body for adding a new prompt to history.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AddPromptRequest {
    pub content: String,
}

/// Request body for adding a message to a session.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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

/// System resource stats snapshot returned by `/api/system/stats`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SystemStats {
    pub cpu_usage_percent: f32,
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub platform: String,
}

/// A single metric item with label, value, optional max and unit.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MetricItem {
    pub label: String,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
}

/// Network availability metric item.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NetworkMetric {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ping: Option<u64>,
}

/// Combined system metrics response (CPU + RAM + network) for the dashboard.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetricsResponse {
    pub cpu: MetricItem,
    pub ram: MetricItem,
    pub network: NetworkMetric,
}

// ── Tool Use (Anthropic API) ────────────────────────────────────────────

/// Anthropic tool definition sent with API requests when tools are enabled.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

/// Serializable tool interaction for API responses.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ToolInteractionInfo {
    pub tool_use_id: String,
    pub tool_name: String,
    #[schema(value_type = Object)]
    pub tool_input: Value,
    pub result: Option<String>,
    pub is_error: bool,
}

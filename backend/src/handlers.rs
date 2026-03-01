use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::Json;
use serde_json::{json, Value};
use tokio_stream::StreamExt;

use crate::models::*;
use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  Per-tool timeout — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

const TOOL_TIMEOUT_SECS: u64 = 15;

// ═══════════════════════════════════════════════════════════════════════
//  Input length limits — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

const MAX_TITLE_LENGTH: usize = 200;
const MAX_MESSAGE_LENGTH: usize = 50_000; // 50KB

// ═══════════════════════════════════════════════════════════════════════
//  #13 Graceful truncation — context window protection
// ═══════════════════════════════════════════════════════════════════════

const MAX_TOOL_OUTPUT_CHARS: usize = 6000;

/// Truncate tool output to `MAX_TOOL_OUTPUT_CHARS` with a clear note.
/// Uses safe UTF-8 boundary via `char_indices()`.
fn truncate_for_context(output: &str) -> String {
    if output.len() <= MAX_TOOL_OUTPUT_CHARS {
        return output.to_string();
    }

    let original_len = output.len();
    let boundary = output
        .char_indices()
        .take_while(|(i, _)| *i < MAX_TOOL_OUTPUT_CHARS)
        .last()
        .map(|(i, c)| i + c.len_utf8())
        .unwrap_or(MAX_TOOL_OUTPUT_CHARS.min(output.len()));

    format!(
        "{}\n\n[Truncated from {} to {} chars]",
        &output[..boundary],
        original_len,
        boundary
    )
}

// ═══════════════════════════════════════════════════════════════════════
//  Jaskier Shared Pattern -- error
// ═══════════════════════════════════════════════════════════════════════

/// Centralized API error type for all handlers.
/// Logs full details server-side, returns sanitized JSON to the client.
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Upstream API error: {0}")]
    Upstream(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Not authenticated: {0}")]
    Unauthorized(String),

    #[error("Service unavailable: {0}")]
    Unavailable(String),
}

impl ApiError {
    /// Structured error code string for programmatic consumption.
    fn error_code(&self) -> &'static str {
        match self {
            ApiError::BadRequest(_) => "BAD_REQUEST",
            ApiError::NotFound(_) => "NOT_FOUND",
            ApiError::Upstream(_) => "UPSTREAM_ERROR",
            ApiError::Internal(_) => "INTERNAL_ERROR",
            ApiError::Unauthorized(_) => "UNAUTHORIZED",
            ApiError::Unavailable(_) => "SERVICE_UNAVAILABLE",
        }
    }
}

impl axum::response::IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let status = match &self {
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::Upstream(_) => StatusCode::BAD_GATEWAY,
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ApiError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            ApiError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
        };

        // Generate a request_id for correlation
        let request_id = uuid::Uuid::new_v4().to_string();

        // Log full detail server-side with request_id
        tracing::error!("API error ({}): {} [request_id={}]", status.as_u16(), self, request_id);

        // Return sanitised message to client — never leak internal details
        let message = match &self {
            ApiError::BadRequest(m) => m.clone(),
            ApiError::NotFound(_) => "Resource not found".to_string(),
            ApiError::Upstream(_) => "Upstream service error".to_string(),
            ApiError::Internal(_) => "Internal server error".to_string(),
            ApiError::Unauthorized(m) => m.clone(),
            ApiError::Unavailable(m) => m.clone(),
        };

        // #9 Structured API error response
        let body = json!({
            "error": {
                "code": self.error_code(),
                "message": message,
                "request_id": request_id,
            }
        });
        (status, Json(body)).into_response()
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════

/// Sanitize JSON Value strings — replace U+FFFD sequences and ensure clean UTF-8.
/// Recursively walks the Value tree and cleans every string leaf.
fn sanitize_json_strings(val: &mut Value) {
    match val {
        Value::String(s) => {
            // Remove replacement characters that may have been introduced by lossy UTF-8 conversion
            if s.contains('\u{FFFD}') {
                *s = s.replace('\u{FFFD}', "");
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                sanitize_json_strings(item);
            }
        }
        Value::Object(map) => {
            for (_, v) in map.iter_mut() {
                sanitize_json_strings(v);
            }
        }
        _ => {}
    }
}

fn get_anthropic_api_key(api_keys: &std::collections::HashMap<String, String>) -> Result<String, (StatusCode, Json<Value>)> {
    api_keys
        .get("ANTHROPIC_API_KEY")
        .cloned()
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Not authenticated. Please login via Settings → Anthropic OAuth, or configure ANTHROPIC_API_KEY." })),
            )
        })
}

fn build_anthropic_request(
    client: &reqwest::Client,
    api_url: &str,
    api_key: &str,
    body: &Value,
    timeout_secs: u64,
) -> reqwest::RequestBuilder {
    client
        .post(format!("{}/v1/messages", api_url))
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(body)
        .timeout(std::time::Duration::from_secs(timeout_secs))
}

// ═══════════════════════════════════════════════════════════════════════
//  Retry with exponential backoff — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

const MAX_RETRIES: u32 = 3;
const BASE_BACKOFF_MS: u64 = 1000;
const MAX_JITTER_MS: u64 = 500;

/// HTTP status codes that should trigger a retry.
fn is_retryable_status(status: u16) -> bool {
    matches!(status, 429 | 503 | 529)
}

/// Compute backoff duration for a given attempt (0-indexed).
/// Formula: base * 2^attempt + random jitter (0..MAX_JITTER_MS)
fn backoff_duration(attempt: u32) -> std::time::Duration {
    let base_ms = BASE_BACKOFF_MS * 2u64.pow(attempt);
    let jitter_ms = rand::random::<u64>() % (MAX_JITTER_MS + 1);
    std::time::Duration::from_millis(base_ms + jitter_ms)
}

/// Send a single request to Anthropic (no retry), preferring OAuth over API key.
async fn send_to_anthropic_once(
    state: &AppState,
    body: &Value,
    timeout_secs: u64,
) -> Result<reqwest::Response, (StatusCode, Json<Value>)> {
    // Try OAuth first (direct to api.anthropic.com)
    if let Some(access_token) = crate::oauth::get_valid_access_token(state).await {
        let mut body = body.clone();
        crate::oauth::ensure_system_prompt(&mut body);
        return state
            .http_client
            .post("https://api.anthropic.com/v1/messages")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("anthropic-version", "2023-06-01")
            .header("anthropic-beta", crate::oauth::ANTHROPIC_BETA)
            .header("content-type", "application/json")
            .json(&body)
            .timeout(std::time::Duration::from_secs(timeout_secs))
            .send()
            .await
            .map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({ "error": format!("Failed to reach Anthropic API: {}", e) })),
                )
            });
    }

    // Fallback: API key through proxy
    let api_key = {
        let rt = state.runtime.read().await;
        get_anthropic_api_key(&rt.api_keys)?
    };

    let api_url = std::env::var("ANTHROPIC_API_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());

    build_anthropic_request(&state.http_client, &api_url, &api_key, body, timeout_secs)
        .send()
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("Failed to reach Anthropic API: {}", e) })),
            )
        })
}

/// Send a request to Anthropic with circuit breaker check and retry logic.
///
/// Retries up to `MAX_RETRIES` times on retryable errors (429, 503, 529, timeout).
/// Uses exponential backoff with jitter between retries.
/// Checks the circuit breaker before each attempt.
async fn send_to_anthropic(
    state: &AppState,
    body: &Value,
    timeout_secs: u64,
) -> Result<reqwest::Response, (StatusCode, Json<Value>)> {
    // Circuit breaker check
    if !state.circuit_breaker.allow_request().await {
        tracing::warn!("send_to_anthropic: circuit breaker is OPEN — failing fast");
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "Anthropic API circuit breaker is open — too many recent failures. Retrying in 60s." })),
        ));
    }

    let mut last_err = None;

    for attempt in 0..=MAX_RETRIES {
        if attempt > 0 {
            let delay = backoff_duration(attempt - 1);
            tracing::info!(
                "send_to_anthropic: retry {}/{} after {}ms backoff",
                attempt, MAX_RETRIES, delay.as_millis()
            );
            tokio::time::sleep(delay).await;

            // Re-check circuit breaker before retry
            if !state.circuit_breaker.allow_request().await {
                tracing::warn!("send_to_anthropic: circuit breaker tripped during retries — aborting");
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({ "error": "Anthropic API circuit breaker tripped during retries" })),
                ));
            }
        }

        match send_to_anthropic_once(state, body, timeout_secs).await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if resp.status().is_success() || resp.status().is_redirection() {
                    // Success — record it and return
                    state.circuit_breaker.record_success().await;
                    return Ok(resp);
                }

                if is_retryable_status(status) && attempt < MAX_RETRIES {
                    tracing::warn!(
                        "send_to_anthropic: retryable HTTP {} on attempt {}/{}",
                        status, attempt + 1, MAX_RETRIES + 1
                    );
                    state.circuit_breaker.record_failure().await;
                    // Consume the body so it doesn't leak, store error for fallback
                    let err_body: Value = resp.json().await.unwrap_or_default();
                    last_err = Some((
                        StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
                        Json(json!({ "error": err_body })),
                    ));
                    continue;
                }

                // Non-retryable error status — record failure and return as-is
                state.circuit_breaker.record_failure().await;
                return Ok(resp);
            }
            Err(e) => {
                // Network/timeout error — retryable
                tracing::warn!(
                    "send_to_anthropic: network error on attempt {}/{}: {:?}",
                    attempt + 1, MAX_RETRIES + 1, e.1
                );
                state.circuit_breaker.record_failure().await;
                last_err = Some(e);
                if attempt < MAX_RETRIES {
                    continue;
                }
            }
        }
    }

    // All retries exhausted — return last error
    Err(last_err.unwrap_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": "Anthropic API request failed after all retries" })),
        )
    }))
}

// ═══════════════════════════════════════════════════════════════════════
//  Health & System
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(get, path = "/api/health", tag = "health",
    responses((status = 200, description = "Health check with provider status", body = HealthResponse))
)]
pub async fn health_check(State(state): State<AppState>) -> Json<Value> {
    let uptime = state.start_time.elapsed().as_secs();
    let rt = state.runtime.read().await;
    let has_oauth = crate::oauth::has_oauth_tokens(&state).await;

    let resp = HealthResponse {
        status: if state.is_ready() { "ok" } else { "starting" }.to_string(),
        version: "4.0.0".to_string(),
        app: "ClaudeHydra".to_string(),
        uptime_seconds: uptime,
        providers: vec![
            ProviderInfo {
                name: "anthropic".to_string(),
                available: rt.api_keys.contains_key("ANTHROPIC_API_KEY") || has_oauth,
            },
            ProviderInfo {
                name: "google".to_string(),
                available: rt.api_keys.contains_key("GOOGLE_API_KEY"),
            },
        ],
    };

    Json(serde_json::to_value(resp).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

/// GET /api/health/ready — lightweight readiness probe (no locks, no DB).
#[utoipa::path(get, path = "/api/health/ready", tag = "health",
    responses(
        (status = 200, description = "Service ready", body = Value),
        (status = 503, description = "Service not ready", body = Value)
    )
)]
pub async fn readiness(State(state): State<AppState>) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    let ready = state.is_ready();
    let uptime = state.start_time.elapsed().as_secs();
    let body = json!({ "ready": ready, "uptime_seconds": uptime });

    if ready {
        (StatusCode::OK, Json(body)).into_response()
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, Json(body)).into_response()
    }
}

/// GET /api/auth/mode — tells frontend whether auth is required
#[utoipa::path(get, path = "/api/auth/mode", tag = "auth",
    responses((status = 200, description = "Auth mode info", body = Value))
)]
pub async fn auth_mode(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "auth_required": state.auth_secret.is_some()
    }))
}

#[utoipa::path(get, path = "/api/system/stats", tag = "system",
    responses((status = 200, description = "System resource usage", body = SystemStats))
)]
pub async fn system_stats(State(state): State<AppState>) -> Json<Value> {
    let snap = state.system_monitor.read().await;
    let stats = SystemStats {
        cpu_usage_percent: snap.cpu_usage_percent,
        memory_used_mb: snap.memory_used_mb,
        memory_total_mb: snap.memory_total_mb,
        platform: snap.platform.clone(),
    };
    Json(serde_json::to_value(stats).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

// ═══════════════════════════════════════════════════════════════════════
//  Admin — API key hot-reload
// ═══════════════════════════════════════════════════════════════════════

/// Hot-reload an API key for a provider without restarting the backend.
/// Protected — requires auth when AUTH_SECRET is set.
pub async fn rotate_key(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let provider = body
        .get("provider")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::BadRequest("missing 'provider' field".into()))?;
    let key = body
        .get("key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::BadRequest("missing 'key' field".into()))?;

    match provider {
        "google" | "anthropic" => {}
        _ => {
            return Err(ApiError::BadRequest(format!(
                "unknown provider '{}' — expected google or anthropic",
                provider
            )));
        }
    }

    // Update the key in runtime state
    let env_key = match provider {
        "google" => "GOOGLE_API_KEY",
        "anthropic" => "ANTHROPIC_API_KEY",
        _ => unreachable!(),
    };
    let mut rt = state.runtime.write().await;
    rt.api_keys.insert(env_key.to_string(), key.to_string());
    drop(rt);

    tracing::info!("API key rotated for provider '{}'", provider);

    Ok(Json(json!({
        "ok": true,
        "provider": provider,
        "message": format!("API key for '{}' updated successfully", provider),
    })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Agents
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(get, path = "/api/agents", tag = "agents",
    responses((status = 200, description = "List of configured agents", body = Vec<WitcherAgent>))
)]
pub async fn list_agents(State(state): State<AppState>) -> impl axum::response::IntoResponse {
    // #6 — Cache agent list for 60 seconds
    let agents = state.agents.read().await;
    (
        [(axum::http::header::CACHE_CONTROL, "public, max-age=60")],
        Json(serde_json::to_value(&*agents).unwrap_or_else(|_| json!({"error": "serialization failed"}))),
    )
}

/// POST /api/agents/refresh — Hot-reload agents from definitions.
pub async fn refresh_agents(State(state): State<AppState>) -> Json<Value> {
    state.refresh_agents().await;
    let agents = state.agents.read().await;
    Json(json!({ "status": "ok", "count": agents.len() }))
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude API
// ═══════════════════════════════════════════════════════════════════════

/// GET /api/claude/models — dynamically resolved Claude models per tier
#[utoipa::path(get, path = "/api/claude/models", tag = "chat",
    responses((status = 200, description = "Claude models per tier", body = Vec<ClaudeModelInfo>))
)]
pub async fn claude_models(State(state): State<AppState>) -> Json<Value> {
    let resolved = crate::model_registry::resolve_models(&state).await;

    let models = vec![
        ClaudeModelInfo {
            id: resolved.commander.as_ref().map(|m| m.id.clone()).unwrap_or_else(|| "claude-opus-4-6".to_string()),
            name: resolved.commander.as_ref().and_then(|m| m.display_name.clone()).unwrap_or_else(|| "Claude Opus".to_string()),
            tier: "Commander".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        ClaudeModelInfo {
            id: resolved.coordinator.as_ref().map(|m| m.id.clone()).unwrap_or_else(|| "claude-sonnet-4-6".to_string()),
            name: resolved.coordinator.as_ref().and_then(|m| m.display_name.clone()).unwrap_or_else(|| "Claude Sonnet".to_string()),
            tier: "Coordinator".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        ClaudeModelInfo {
            id: resolved.executor.as_ref().map(|m| m.id.clone()).unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string()),
            name: resolved.executor.as_ref().and_then(|m| m.display_name.clone()).unwrap_or_else(|| "Claude Haiku".to_string()),
            tier: "Executor".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
    ];

    Json(serde_json::to_value(models).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

/// POST /api/claude/chat — non-streaming Claude request
#[utoipa::path(post, path = "/api/claude/chat", tag = "chat",
    request_body = ChatRequest,
    responses(
        (status = 200, description = "Chat completion", body = ChatResponse),
        (status = 502, description = "Upstream error", body = Value)
    )
)]
pub async fn claude_chat(
    State(state): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let default_model = crate::model_registry::get_model_id(&state, "coordinator").await;
    let model = req.model.unwrap_or(default_model);
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

    sanitize_json_strings(&mut body);

    let resp = send_to_anthropic(&state, &body, 120).await?;

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

    Ok(Json(serde_json::to_value(chat_resp).map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "serialization failed"})))
    })?))
}

// ═══════════════════════════════════════════════════════════════════════
//  Shared Chat Context Resolution
// ═══════════════════════════════════════════════════════════════════════

/// Shared preprocessing for both tools and no-tools streaming paths.
struct ChatContext {
    model: String,
    max_tokens: u32,
    working_directory: String,
    session_id: Option<uuid::Uuid>,
    system_prompt: String,
}

/// Build system prompt server-side (prevents client-side manipulation).
fn build_system_prompt(working_directory: &str, language: &str) -> String {
    let lang_name = if language == "pl" { "Polish" } else { "English" };
    let mut lines = vec![
        "You are a Witcher-themed AI agent in the ClaudeHydra v4 Swarm Control Center.".to_string(),
        "The swarm consists of 12 agents organized in 3 tiers:".to_string(),
        "- Commander (Geralt, Yennefer, Vesemir) → Claude Opus 4.6".to_string(),
        "- Coordinator (Triss, Jaskier, Ciri, Dijkstra) → Claude Sonnet 4.5".to_string(),
        "- Executor (Lambert, Eskel, Regis, Zoltan, Philippa) → Claude Haiku 4.5".to_string(),
        String::new(),
        "You assist the user with software engineering tasks.".to_string(),
        "You have access to local file tools (read_file, list_directory, write_file, search_in_files).".to_string(),
        "Use them proactively when the user asks about files or code.".to_string(),
        "Respond concisely and helpfully. Use markdown formatting when appropriate.".to_string(),
        format!("Write ALL text in **{}** (except code, file paths, and identifiers).", lang_name),
    ];
    if !working_directory.is_empty() {
        lines.extend([
            String::new(),
            "## Working Directory".to_string(),
            format!("**Current working directory**: `{}`", working_directory),
            "You can use relative paths (e.g. `src/main.rs`) — they resolve against this directory.".to_string(),
            "You do NOT need to specify absolute paths unless referencing files outside this folder.".to_string(),
        ]);
    }
    lines.join("\n")
}

/// Resolves model, max_tokens, session WD (session → global fallback).
/// Uses a single DB query (LEFT JOIN) to fetch both session WD and global WD.
async fn resolve_chat_context(state: &AppState, req: &ChatRequest) -> ChatContext {
    let default_model = crate::model_registry::get_model_id(state, "coordinator").await;
    let model = req.model.clone().unwrap_or(default_model);
    let max_tokens = req.max_tokens.unwrap_or(4096);

    let session_uuid = req
        .session_id
        .as_deref()
        .and_then(|s| uuid::Uuid::parse_str(s).ok());

    // Single query: fetch session WD, global WD, and language in one roundtrip
    let (working_directory, language) = if let Some(ref sid) = session_uuid {
        let row: Option<(String, String, String)> = sqlx::query_as(
            "SELECT COALESCE(s.working_directory, '') AS session_wd, \
             COALESCE(g.working_directory, '') AS global_wd, \
             COALESCE(g.language, 'en') AS language \
             FROM ch_sessions s \
             CROSS JOIN ch_settings g \
             WHERE s.id = $1 AND g.id = 1",
        )
        .bind(sid)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        match row {
            Some((session_wd, global_wd, lang)) => {
                let wd = if !session_wd.is_empty() { session_wd } else { global_wd };
                (wd, lang)
            }
            None => (String::new(), "en".to_string()),
        }
    } else {
        let row: Option<(String, String)> = sqlx::query_as(
            "SELECT COALESCE(working_directory, ''), COALESCE(language, 'en') FROM ch_settings WHERE id = 1",
        )
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        row.unwrap_or_default()
    };

    let system_prompt = build_system_prompt(&working_directory, &language);

    ChatContext {
        model,
        max_tokens,
        working_directory,
        session_id: session_uuid,
        system_prompt,
    }
}

/// Filter out old client-side system prompt injection pattern.
/// The frontend used to send system prompt as first user+assistant message pair.
/// Now the backend handles it via the `system` API field, so strip those messages.
fn filter_client_system_prompt(messages: &[ChatMessage]) -> Vec<Value> {
    let mut result = Vec::new();
    let mut skip_count = 0;

    // Detect old pattern: first user message contains "Witcher-themed AI agent"
    // and second is the "Understood" assistant response
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
//  Claude Streaming  (SSE from Anthropic → NDJSON to frontend)
// ═══════════════════════════════════════════════════════════════════════

/// POST /api/claude/chat/stream
///
/// Sends a streaming request to Anthropic and re-emits as NDJSON:
/// ```text
/// {"token":"Hello","done":false}
/// {"token":" world","done":false}
/// {"token":"","done":true,"model":"claude-sonnet-4-6","total_tokens":42}
/// ```
#[utoipa::path(post, path = "/api/claude/chat/stream", tag = "chat",
    request_body = ChatRequest,
    responses((status = 200, description = "NDJSON stream of chat tokens", content_type = "application/x-ndjson"))
)]
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
        "chat stream (no-tools)"
    );
    let model = ctx.model;
    let max_tokens = ctx.max_tokens;
    let system_prompt = ctx.system_prompt;

    // Filter out any client-side system prompt injection (first 2 messages are the old pattern)
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
        .expect("Response builder with valid status and headers"))
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
    let ctx = resolve_chat_context(&state, &req).await;
    let model = ctx.model;
    let max_tokens = ctx.max_tokens;
    let wd = ctx.working_directory;
    let system_prompt = ctx.system_prompt;

    // Build initial messages — filter out old client-side system prompt injection
    let initial_messages: Vec<Value> = filter_client_system_prompt(&req.messages);

    // Build tool definitions (includes MCP tools from connected servers)
    let tool_defs: Vec<Value> = state
        .tool_executor
        .tool_definitions_with_mcp(&state)
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

    // Use a channel to send NDJSON lines from the spawned task
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(256);

    let state_clone = state.clone();

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
                "system": &system_prompt,
                "messages": &conversation,
                "tools": &tool_defs,
                "stream": true,
            });

            if let Some(temp) = req.temperature {
                body["temperature"] = json!(temp);
            }

            // Sanitize all strings in body to prevent invalid Unicode issues
            sanitize_json_strings(&mut body);

            // Send request to Anthropic (OAuth-aware)
            let resp = match send_to_anthropic(&state_clone, &body, 300).await {
                Ok(r) => r,
                Err((_, Json(err_val))) => {
                    let err_msg = err_val
                        .get("error")
                        .and_then(|e| e.as_str())
                        .unwrap_or("Unknown error");
                    let _ = tx
                        .send(
                            serde_json::to_string(&json!({
                                "token": format!("\n[API error: {}]", err_msg),
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
                let status = resp.status();
                let err_text = resp.text().await.unwrap_or_default();
                tracing::error!(
                    "Anthropic API error (status={}, iteration={}): {}",
                    status,
                    iteration,
                    &err_text[..err_text.len().min(500)]
                );
                if err_text.contains("surrogate") || err_text.contains("invalid") {
                    let body_str = serde_json::to_string(&body).unwrap_or_default();
                    tracing::error!(
                        "Request body size: {} chars, conversation messages: {}",
                        body_str.len(),
                        conversation.len()
                    );
                }
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
                // Per-tool timeout — Jaskier Shared Pattern
                let mut tool_results: Vec<Value> = Vec::new();
                for tu in &tool_uses {
                    let tool_name =
                        tu.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let tool_id =
                        tu.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let empty_input = json!({});
                    let tool_input = tu.get("input").unwrap_or(&empty_input);

                    let timeout = std::time::Duration::from_secs(TOOL_TIMEOUT_SECS);
                    let executor = state_clone.tool_executor.with_working_directory(&wd);
                    let (result, is_error) = match tokio::time::timeout(
                        timeout,
                        executor.execute_with_state(tool_name, tool_input, &state_clone),
                    )
                    .await
                    {
                        Ok(res) => res,
                        Err(_) => {
                            tracing::warn!(
                                "Tool '{}' timed out after {}s",
                                tool_name, TOOL_TIMEOUT_SECS
                            );
                            (
                                format!(
                                    "Tool '{}' timed out after {}s",
                                    tool_name, TOOL_TIMEOUT_SECS
                                ),
                                true,
                            )
                        }
                    };

                    // #13 Graceful truncation — limit tool output for context window
                    let truncated_result = truncate_for_context(&result);

                    // Emit tool_result event to frontend (full result for display)
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

                    // Send truncated result to Anthropic (context window protection)
                    tool_results.push(json!({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": &truncated_result,
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

    // Convert channel receiver into a byte stream with SSE heartbeat (#14)
    let ndjson_stream = async_stream::stream! {
        let mut rx = rx;
        let heartbeat_interval = std::time::Duration::from_secs(15);
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Some(line) => {
                            yield Ok::<_, std::io::Error>(
                                axum::body::Bytes::from(format!("{}\n", line))
                            );
                        }
                        None => break, // channel closed
                    }
                }
                _ = tokio::time::sleep(heartbeat_interval) => {
                    // #14 Keep-alive: SSE comment to prevent proxy timeouts
                    yield Ok::<_, std::io::Error>(
                        axum::body::Bytes::from_static(b": heartbeat\n\n")
                    );
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
        .expect("Response builder with valid status and headers"))
}

// ═══════════════════════════════════════════════════════════════════════
//  Settings (DB-backed)
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(get, path = "/api/settings", tag = "settings",
    responses((status = 200, description = "Current application settings", body = AppSettings))
)]
pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let row = sqlx::query_as::<_, SettingsRow>(
        "SELECT theme, language, default_model, auto_start, welcome_message, working_directory FROM ch_settings WHERE id = 1",
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
        welcome_message: row.welcome_message,
        working_directory: row.working_directory,
    };

    Ok(Json(serde_json::to_value(settings).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?))
}

#[utoipa::path(post, path = "/api/settings", tag = "settings",
    request_body = AppSettings,
    responses((status = 200, description = "Updated settings", body = AppSettings))
)]
pub async fn update_settings(
    State(state): State<AppState>,
    Json(new_settings): Json<AppSettings>,
) -> Result<Json<Value>, StatusCode> {
    // Validate working_directory if non-empty
    if !new_settings.working_directory.is_empty() && !std::path::Path::new(&new_settings.working_directory).is_dir() {
        return Err(StatusCode::BAD_REQUEST);
    }

    sqlx::query(
        "UPDATE ch_settings SET theme = $1, language = $2, default_model = $3, \
         auto_start = $4, welcome_message = $5, working_directory = $6, updated_at = NOW() WHERE id = 1",
    )
    .bind(&new_settings.theme)
    .bind(&new_settings.language)
    .bind(&new_settings.default_model)
    .bind(new_settings.auto_start)
    .bind(&new_settings.welcome_message)
    .bind(&new_settings.working_directory)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update settings: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // #40 Audit log
    crate::audit::log_audit(
        &state.db,
        "update_settings",
        serde_json::to_value(&new_settings).unwrap_or_default(),
        None,
    )
    .await;

    Ok(Json(serde_json::to_value(&new_settings).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?))
}

#[utoipa::path(post, path = "/api/settings/api-key", tag = "auth",
    request_body = ApiKeyRequest,
    responses((status = 200, description = "API key set", body = Value))
)]
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

/// Pagination query params for session/message listing.
/// Backwards-compatible: all fields optional with sensible defaults.
/// Supports cursor-based pagination via `after` (session ID) for stable scrolling.
#[derive(Debug, serde::Deserialize)]
pub struct PaginationParams {
    /// Max items to return (clamped to 500).
    #[serde(default)]
    pub limit: Option<i64>,
    /// Number of items to skip (offset-based, ignored when `after` is set).
    #[serde(default)]
    pub offset: Option<i64>,
    /// Cursor: session ID to start after (cursor-based pagination).
    #[serde(default)]
    pub after: Option<String>,
}

#[utoipa::path(get, path = "/api/sessions", tag = "sessions",
    params(
        ("limit" = Option<i64>, Query, description = "Max sessions to return (default 100, max 500)"),
        ("offset" = Option<i64>, Query, description = "Number of sessions to skip (default 0)"),
        ("after" = Option<String>, Query, description = "Cursor: session ID to start after (cursor-based pagination)"),
    ),
    responses((status = 200, description = "List of session summaries with pagination metadata"))
)]
pub async fn list_sessions(
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Value>, StatusCode> {
    let limit = params.limit.unwrap_or(100).clamp(1, 500);

    // Cursor-based pagination: when `after` is provided, fetch sessions older than the cursor.
    // Falls back to offset-based pagination when `after` is absent.
    let rows = if let Some(ref cursor_id) = params.after {
        let cursor_uuid = uuid::Uuid::parse_str(cursor_id).map_err(|_| {
            tracing::warn!("list_sessions: invalid cursor UUID: {}", cursor_id);
            StatusCode::BAD_REQUEST
        })?;
        sqlx::query_as::<_, SessionSummaryRow>(
            "SELECT s.id, s.title, s.created_at, \
             (SELECT COUNT(*) FROM ch_messages WHERE session_id = s.id) as message_count, \
             s.working_directory \
             FROM ch_sessions s \
             WHERE s.updated_at < (SELECT updated_at FROM ch_sessions WHERE id = $1) \
             ORDER BY s.updated_at DESC \
             LIMIT $2",
        )
        .bind(cursor_uuid)
        .bind(limit + 1) // fetch one extra to determine has_more
        .fetch_all(&state.db)
        .await
    } else {
        let offset = params.offset.unwrap_or(0).max(0);
        sqlx::query_as::<_, SessionSummaryRow>(
            "SELECT s.id, s.title, s.created_at, \
             (SELECT COUNT(*) FROM ch_messages WHERE session_id = s.id) as message_count, \
             s.working_directory \
             FROM ch_sessions s ORDER BY s.updated_at DESC \
             LIMIT $1 OFFSET $2",
        )
        .bind(limit + 1) // fetch one extra to determine has_more
        .bind(offset)
        .fetch_all(&state.db)
        .await
    }
    .map_err(|e| {
        tracing::error!("Failed to list sessions: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_more = rows.len() as i64 > limit;
    let rows_trimmed: Vec<_> = rows.into_iter().take(limit as usize).collect();

    let next_cursor = if has_more {
        rows_trimmed.last().map(|r| r.id.to_string())
    } else {
        None
    };

    let summaries: Vec<SessionSummary> = rows_trimmed
        .into_iter()
        .map(|r| SessionSummary {
            id: r.id.to_string(),
            title: r.title,
            created_at: r.created_at.to_rfc3339(),
            message_count: r.message_count as usize,
            working_directory: r.working_directory,
        })
        .collect();

    Ok(Json(json!({
        "sessions": summaries,
        "has_more": has_more,
        "next_cursor": next_cursor,
    })))
}

#[utoipa::path(post, path = "/api/sessions", tag = "sessions",
    request_body = CreateSessionRequest,
    responses((status = 201, description = "Session created", body = Session))
)]
pub async fn create_session(
    State(state): State<AppState>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    if req.title.len() > MAX_TITLE_LENGTH {
        tracing::warn!("create_session: title exceeds {} chars (got {})", MAX_TITLE_LENGTH, req.title.len());
        return Err(StatusCode::BAD_REQUEST);
    }

    let row = sqlx::query_as::<_, SessionRow>(
        "INSERT INTO ch_sessions (title) VALUES ($1) \
         RETURNING id, title, created_at, updated_at, working_directory",
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
        Json(serde_json::to_value(session).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?),
    ))
}

#[utoipa::path(get, path = "/api/sessions/{id}", tag = "sessions",
    params(
        ("id" = String, Path, description = "Session UUID"),
        ("limit" = Option<i64>, Query, description = "Max messages to return (default 200, max 500)"),
        ("offset" = Option<i64>, Query, description = "Number of messages to skip (default 0)"),
    ),
    responses(
        (status = 200, description = "Session with messages", body = Session),
        (status = 404, description = "Session not found")
    )
)]
pub async fn get_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;
    let msg_limit = params.limit.unwrap_or(200).clamp(1, 500);
    let msg_offset = params.offset.unwrap_or(0).max(0);

    let session_row = sqlx::query_as::<_, SessionRow>(
        "SELECT id, title, created_at, updated_at, working_directory FROM ch_sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    // #7 Message history pagination — get total count for pagination metadata
    let total_messages: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ch_messages WHERE session_id = $1",
    )
    .bind(session_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to count session messages: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Fetch the most recent N messages (subquery DESC, then re-sort ASC)
    let message_rows = sqlx::query_as::<_, MessageRow>(
        "SELECT * FROM (\
            SELECT id, session_id, role, content, model, agent, created_at \
            FROM ch_messages WHERE session_id = $1 \
            ORDER BY created_at DESC LIMIT $2 OFFSET $3\
        ) sub ORDER BY created_at ASC",
    )
    .bind(session_id)
    .bind(msg_limit)
    .bind(msg_offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get session messages: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Load tool interactions only for the fetched messages
    let message_ids: Vec<uuid::Uuid> = message_rows.iter().map(|m| m.id).collect();
    let ti_rows = if message_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as::<_, ToolInteractionRow>(
            "SELECT ti.id, ti.message_id, ti.tool_use_id, ti.tool_name, \
             ti.tool_input, ti.result, ti.is_error, ti.executed_at \
             FROM ch_tool_interactions ti \
             WHERE ti.message_id = ANY($1) \
             ORDER BY ti.executed_at ASC",
        )
        .bind(&message_ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    };

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

    // #7 Return session with pagination metadata (total_messages, limit, offset)
    let resp = json!({
        "id": session_row.id.to_string(),
        "title": session_row.title,
        "created_at": session_row.created_at.to_rfc3339(),
        "working_directory": session_row.working_directory,
        "messages": serde_json::to_value(&messages).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        "pagination": {
            "total": total_messages,
            "limit": msg_limit,
            "offset": msg_offset,
        }
    });

    Ok(Json(resp))
}

#[utoipa::path(patch, path = "/api/sessions/{id}", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    request_body = UpdateSessionRequest,
    responses(
        (status = 200, description = "Session updated", body = SessionSummary),
        (status = 404, description = "Session not found")
    )
)]
pub async fn update_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateSessionRequest>,
) -> Result<Json<Value>, StatusCode> {
    if req.title.len() > MAX_TITLE_LENGTH {
        tracing::warn!("update_session: title exceeds {} chars (got {})", MAX_TITLE_LENGTH, req.title.len());
        return Err(StatusCode::BAD_REQUEST);
    }

    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    let row = sqlx::query_as::<_, SessionRow>(
        "UPDATE ch_sessions SET title = $1, updated_at = NOW() WHERE id = $2 \
         RETURNING id, title, created_at, updated_at, working_directory",
    )
    .bind(&req.title)
    .bind(session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let session = SessionSummary {
        id: row.id.to_string(),
        title: row.title,
        created_at: row.created_at.to_rfc3339(),
        message_count: 0,
        working_directory: row.working_directory,
    };

    Ok(Json(serde_json::to_value(session).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?))
}

// ═══════════════════════════════════════════════════════════════════════
//  Per-session working directory
// ═══════════════════════════════════════════════════════════════════════

/// PATCH /api/sessions/{id}/working-directory
pub async fn update_session_working_directory(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateWorkingDirectoryRequest>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;
    let wd = req.working_directory.trim().to_string();

    if !wd.is_empty() && !std::path::Path::new(&wd).is_dir() {
        return Err(StatusCode::BAD_REQUEST);
    }

    sqlx::query("UPDATE ch_sessions SET working_directory = $1, updated_at = NOW() WHERE id = $2")
        .bind(&wd)
        .bind(session_id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({ "working_directory": wd })))
}

// ═══════════════════════════════════════════════════════════════════════
//  File listing (DirBrowser) — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

#[derive(Debug, serde::Deserialize)]
pub struct FileListRequest {
    pub path: String,
    #[serde(default)]
    pub show_hidden: bool,
}

pub async fn list_files(Json(body): Json<FileListRequest>) -> Json<Value> {
    let path = std::path::Path::new(&body.path);
    if !path.is_dir() {
        return Json(json!({ "error": "Path is not a directory", "path": body.path }));
    }

    let mut entries = Vec::new();
    match tokio::fs::read_dir(&body.path).await {
        Ok(mut rd) => {
            while let Ok(Some(entry)) = rd.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                if !body.show_hidden && name.starts_with('.') {
                    continue;
                }
                let is_dir = entry
                    .metadata()
                    .await
                    .map(|m| m.is_dir())
                    .unwrap_or(false);
                entries.push(json!({
                    "name": name,
                    "path": entry.path().to_string_lossy().to_string(),
                    "is_dir": is_dir,
                }));
            }
            entries.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
            Json(json!({ "path": body.path, "entries": entries, "count": entries.len() }))
        }
        Err(e) => Json(json!({
            "error": format!("Cannot read directory: {}", e),
            "path": body.path,
        })),
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Native folder dialog — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

/// Opens a modern Windows Explorer folder picker via PowerShell COM interop.
/// Returns the selected path or `{ "cancelled": true }` if user closed the dialog.
pub async fn browse_directory(Json(body): Json<Value>) -> Json<Value> {
    let initial = body
        .get("initial_path")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Modern Explorer-style folder picker using Shell.Application COM object.
    // Falls back to FolderBrowserDialog on older Windows versions.
    let script = format!(
        r#"Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
try {{
    # Modern CommonOpenFileDialog (Windows Vista+)
    [void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
    $src = @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
internal class FileOpenDialogCOM {{ }}

[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IFileOpenDialog {{
    [PreserveSig] int Show(IntPtr hwndOwner);
    void SetFileTypes();
    void SetFileTypeIndex();
    void GetFileTypeIndex();
    void Advise();
    void Unadvise();
    void SetOptions(uint fos);
    void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName();
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel();
    void SetFileNameLabel();
    void GetResult(out IShellItem ppsi);
    void AddPlace();
    void SetDefaultExtension();
    void Close();
    void SetClientGuid();
    void ClearClientData();
    void SetFilter();
    void GetResults();
    void GetSelectedItems();
}}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IShellItem {{
    void BindToHandler();
    void GetParent();
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes();
    void Compare();
}}

public class FolderPicker {{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

    const uint FOS_PICKFOLDERS = 0x20;
    const uint FOS_FORCEFILESYSTEM = 0x40;
    static readonly Guid IShellItemGuid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");

    public static string Show(string initialPath) {{
        var dlg = (IFileOpenDialog)new FileOpenDialogCOM();
        dlg.SetTitle("Select Working Directory");
        dlg.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
        if (!string.IsNullOrEmpty(initialPath) && System.IO.Directory.Exists(initialPath)) {{
            IShellItem folder;
            SHCreateItemFromParsingName(initialPath, IntPtr.Zero, IShellItemGuid, out folder);
            dlg.SetFolder(folder);
        }}
        int hr = dlg.Show(IntPtr.Zero);
        if (hr != 0) return "__CANCELLED__";
        IShellItem result;
        dlg.GetResult(out result);
        string path;
        result.GetDisplayName(0x80058000, out path);
        return path;
    }}
}}
"@
    Add-Type -TypeDefinition $src -Language CSharp -ErrorAction Stop
    $result = [FolderPicker]::Show("{initial_path}")
    Write-Host $result
}} catch {{
    # Fallback: classic FolderBrowserDialog
    $f = New-Object System.Windows.Forms.FolderBrowserDialog
    $f.Description = "Select Working Directory"
    $f.ShowNewFolderButton = $true
    {initial_line_fallback}
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true
    $owner.ShowInTaskbar = $false
    $owner.Size = New-Object System.Drawing.Size(0,0)
    $owner.StartPosition = 'Manual'
    $owner.Location = New-Object System.Drawing.Point(-9999,-9999)
    $owner.Show()
    if ($f.ShowDialog($owner) -eq "OK") {{
        Write-Host $f.SelectedPath
    }} else {{
        Write-Host "__CANCELLED__"
    }}
    $owner.Dispose()
}}
"#,
        initial_path = initial.replace('\\', "\\\\").replace('"', "`\""),
        initial_line_fallback = if initial.is_empty() {
            String::new()
        } else {
            format!(
                "$f.SelectedPath = \"{}\"",
                initial.replace('\\', "\\\\").replace('"', "`\"")
            )
        }
    );

    let tmp = std::env::temp_dir().join(format!("jaskier_browse_{}.ps1", std::process::id()));
    if let Err(e) = tokio::fs::write(&tmp, &script).await {
        return Json(json!({ "error": format!("Cannot write temp script: {}", e) }));
    }

    let result = tokio::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &tmp.to_string_lossy(),
        ])
        .output()
        .await;

    // Cleanup temp file (best-effort)
    let _ = tokio::fs::remove_file(&tmp).await;

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout == "__CANCELLED__" || stdout.is_empty() {
                Json(json!({ "cancelled": true }))
            } else {
                Json(json!({ "path": stdout }))
            }
        }
        Err(e) => Json(json!({ "error": format!("Failed to open folder dialog: {}", e) })),
    }
}

#[utoipa::path(delete, path = "/api/sessions/{id}", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    responses(
        (status = 200, description = "Session deleted", body = Value),
        (status = 404, description = "Session not found")
    )
)]
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

    // #40 Audit log
    crate::audit::log_audit(
        &state.db,
        "delete_session",
        json!({ "session_id": id }),
        None,
    )
    .await;

    Ok(Json(json!({ "status": "deleted", "id": id })))
}

#[utoipa::path(post, path = "/api/sessions/{id}/messages", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    request_body = AddMessageRequest,
    responses(
        (status = 201, description = "Message added", body = HistoryEntry),
        (status = 404, description = "Session not found")
    )
)]
pub async fn add_session_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<AddMessageRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    if req.content.len() > MAX_MESSAGE_LENGTH {
        tracing::warn!("add_session_message: content exceeds {} chars (got {})", MAX_MESSAGE_LENGTH, req.content.len());
        return Err(StatusCode::BAD_REQUEST);
    }

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
        Json(serde_json::to_value(entry).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?),
    ))
}

// ═══════════════════════════════════════════════════════════════════════
//  AI title generation — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

/// POST /api/sessions/:id/generate-title
///
/// Reads the first user message from the session and asks Claude Haiku
/// to produce a concise 3-7 word title. Updates the DB and returns the title.
#[utoipa::path(post, path = "/api/sessions/{id}/generate-title", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    responses(
        (status = 200, description = "AI-generated title", body = Value),
        (status = 404, description = "Session not found or no user messages"),
        (status = 503, description = "No API credentials configured")
    )
)]
pub async fn generate_session_title(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    // Fetch first user message
    let first_msg = sqlx::query_scalar::<_, String>(
        "SELECT content FROM ch_messages \
         WHERE session_id = $1 AND role = 'user' \
         ORDER BY created_at ASC LIMIT 1",
    )
    .bind(session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("generate_session_title: DB error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Truncate message to ~500 chars for the prompt (safe UTF-8 boundary)
    let snippet: &str = if first_msg.len() > 500 {
        let end = first_msg
            .char_indices()
            .take_while(|(i, _)| *i < 500)
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(500.min(first_msg.len()));
        &first_msg[..end]
    } else {
        &first_msg
    };

    let body = json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 64,
        "messages": [{
            "role": "user",
            "content": format!(
                "Generate a concise 3-7 word title for a chat that starts with this message. \
                 Return ONLY the title text, no quotes, no explanation.\n\nMessage: {}",
                snippet
            )
        }]
    });

    let resp = send_to_anthropic(&state, &body, 15).await.map_err(|e| {
        tracing::error!("generate_session_title: API error: {:?}", e.1);
        StatusCode::BAD_GATEWAY
    })?;

    if !resp.status().is_success() {
        tracing::error!("generate_session_title: API returned {}", resp.status());
        return Err(StatusCode::BAD_GATEWAY);
    }

    let json_resp: Value = resp.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    let raw_title = json_resp
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("");
    let raw_title = raw_title.trim().trim_matches('"').trim();

    if raw_title.is_empty() {
        tracing::warn!(
            "generate_session_title: Anthropic response missing text, response keys: {:?}",
            json_resp.as_object().map(|o| o.keys().collect::<Vec<_>>())
        );
        return Err(StatusCode::BAD_GATEWAY);
    }

    // Sanitize: cap at MAX_TITLE_LENGTH
    let title: String = raw_title.chars().take(MAX_TITLE_LENGTH).collect();

    // Update session title in DB
    sqlx::query("UPDATE ch_sessions SET title = $1, updated_at = NOW() WHERE id = $2")
        .bind(&title)
        .bind(session_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("generate_session_title: DB update failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    tracing::info!("generate_session_title: session {} → {:?}", session_id, title);
    Ok(Json(json!({ "title": title })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Prompt History
// ═══════════════════════════════════════════════════════════════════════

const MAX_PROMPT_HISTORY: i64 = 200;

/// GET /api/prompt-history — list all prompts (oldest first).
#[utoipa::path(get, path = "/api/prompt-history", tag = "prompt-history",
    responses((status = 200, description = "List of prompt strings", body = Vec<String>))
)]
pub async fn list_prompt_history(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let rows = sqlx::query_as::<_, PromptHistoryRow>(
        "SELECT id, content, created_at FROM ch_prompt_history ORDER BY created_at ASC LIMIT 500",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list prompt history: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let prompts: Vec<String> = rows.into_iter().map(|r| r.content).collect();
    Ok(Json(json!(prompts)))
}

/// POST /api/prompt-history — add a prompt (dedup + cap).
#[utoipa::path(post, path = "/api/prompt-history", tag = "prompt-history",
    request_body = AddPromptRequest,
    responses((status = 201, description = "Prompt saved"))
)]
pub async fn add_prompt_history(
    State(state): State<AppState>,
    Json(body): Json<AddPromptRequest>,
) -> Result<StatusCode, StatusCode> {
    let trimmed = body.content.trim();
    if trimmed.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Deduplicate: skip if last entry is identical
    let last: Option<String> = sqlx::query_scalar(
        "SELECT content FROM ch_prompt_history ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check last prompt: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(ref last_content) = last {
        if last_content == trimmed {
            return Ok(StatusCode::OK);
        }
    }

    // Insert new prompt
    sqlx::query("INSERT INTO ch_prompt_history (content) VALUES ($1)")
        .bind(trimmed)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to insert prompt: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Cap at MAX_PROMPT_HISTORY — delete oldest beyond limit
    sqlx::query(
        "DELETE FROM ch_prompt_history WHERE id NOT IN \
         (SELECT id FROM ch_prompt_history ORDER BY created_at DESC LIMIT $1)",
    )
    .bind(MAX_PROMPT_HISTORY)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to cap prompt history: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::CREATED)
}

/// DELETE /api/prompt-history — clear all prompt history.
#[utoipa::path(delete, path = "/api/prompt-history", tag = "prompt-history",
    responses((status = 200, description = "Prompt history cleared"))
)]
pub async fn clear_prompt_history(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    sqlx::query("DELETE FROM ch_prompt_history")
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to clear prompt history: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(json!({ "cleared": true })))
}

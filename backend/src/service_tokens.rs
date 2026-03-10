// Jaskier Shared Pattern — Service Token Management
// Generic encrypted token storage for services like Fly.io.
// Reuses encrypt_token/decrypt_token from oauth.rs.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::oauth::{decrypt_token, encrypt_token};
use crate::state::AppState;

// ── Validation constants ─────────────────────────────────────────────────
const MAX_SERVICE_NAME_LEN: usize = 64;
const MAX_TOKEN_SIZE: usize = 10_240; // 10 KB

/// Validate a service name: alphanumeric + underscore + hyphen, max 64 chars.
fn validate_service_name(name: &str) -> Result<(), (StatusCode, Json<Value>)> {
    if name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "service name is required" })),
        ));
    }
    if name.len() > MAX_SERVICE_NAME_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                json!({ "error": format!("service name exceeds maximum length of {} characters", MAX_SERVICE_NAME_LEN) }),
            ),
        ));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                json!({ "error": "service name must contain only alphanumeric characters, underscores, and hyphens" }),
            ),
        ));
    }
    Ok(())
}

/// Validate token size: max 10 KB before encryption/storage.
fn validate_token_size(token: &str) -> Result<(), (StatusCode, Json<Value>)> {
    if token.len() > MAX_TOKEN_SIZE {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                json!({ "error": format!("token exceeds maximum size of {} bytes", MAX_TOKEN_SIZE) }),
            ),
        ));
    }
    Ok(())
}

/// Check that an encryption key is configured (OAUTH_ENCRYPTION_KEY or AUTH_SECRET).
/// Storing tokens in plaintext is not allowed.
fn require_encryption_key() -> Result<(), (StatusCode, Json<Value>)> {
    let has_key = std::env::var("OAUTH_ENCRYPTION_KEY")
        .or_else(|_| std::env::var("AUTH_SECRET"))
        .ok()
        .filter(|s| !s.is_empty())
        .is_some();

    if !has_key {
        tracing::error!(
            "SERVICE_TOKEN_KEY (OAUTH_ENCRYPTION_KEY / AUTH_SECRET) is not configured — refusing to store token in plaintext"
        );
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(
                json!({ "error": "Encryption key not configured — cannot store tokens securely" }),
            ),
        ));
    }
    Ok(())
}

// ── DB row ───────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ServiceTokenRow {
    service: String,
    encrypted_token: String,
}

// ═══════════════════════════════════════════════════════════════════════
//  Handlers (PROTECTED — behind auth middleware)
// ═══════════════════════════════════════════════════════════════════════

/// GET /api/tokens — list all stored service tokens (names only, not values)
pub async fn list_tokens(State(state): State<AppState>) -> Json<Value> {
    let rows = sqlx::query_as::<_, ServiceTokenRow>(concat!(
        "SELECT service, encrypted_token FROM ",
        "ch_service_tokens"
    ))
    .fetch_all(&state.db)
    .await
    .unwrap_or_else(|e| {
        tracing::error!("Failed to list service tokens: {}", e);
        vec![]
    });

    let services: Vec<Value> = rows
        .iter()
        .map(|r| {
            if !r.encrypted_token.starts_with("enc:") {
                tracing::warn!(
                    "Service token for '{}' is stored in plaintext — re-store to encrypt",
                    r.service
                );
            }
            json!({
                "service": r.service,
                "configured": decrypt_token(&r.encrypted_token).is_some(),
            })
        })
        .collect();

    Json(json!({ "tokens": services }))
}

#[derive(Deserialize)]
pub struct StoreTokenRequest {
    pub service: String,
    pub token: String,
}

/// POST /api/tokens — store or update a service token
pub async fn store_token(
    State(state): State<AppState>,
    Json(req): Json<StoreTokenRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    validate_service_name(&req.service)?;

    if req.token.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "token is required" })),
        ));
    }

    validate_token_size(&req.token)?;
    require_encryption_key()?;

    let encrypted = encrypt_token(&req.token);

    sqlx::query(concat!(
        "INSERT INTO ",
        "ch_service_tokens",
        " (service, encrypted_token, updated_at) ",
        "VALUES ($1, $2, NOW()) ",
        "ON CONFLICT (service) DO UPDATE SET ",
        "encrypted_token = $2, updated_at = NOW()"
    ))
    .bind(&req.service)
    .bind(&encrypted)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to store service token: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to store authentication data" })),
        )
    })?;

    tracing::info!("Service token stored for: {}", req.service);

    Ok(Json(json!({
        "status": "ok",
        "service": req.service,
    })))
}

/// DELETE /api/tokens/{service} — delete a service token
pub async fn delete_token(
    State(state): State<AppState>,
    Path(service): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    validate_service_name(&service)?;

    sqlx::query(concat!(
        "DELETE FROM ",
        "ch_service_tokens",
        " WHERE service = $1"
    ))
    .bind(&service)
    .execute(&state.db)
    .await
    .ok();

    tracing::info!("Service token deleted for: {}", service);
    Ok(Json(json!({ "status": "ok" })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Token access (used by tools)
// ═══════════════════════════════════════════════════════════════════════

/// Get a decrypted service token by service name.
pub async fn get_service_token(state: &AppState, service: &str) -> Option<String> {
    // Validate service name (log + reject invalid names silently)
    if service.is_empty()
        || service.len() > MAX_SERVICE_NAME_LEN
        || !service
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        tracing::warn!(
            "get_service_token called with invalid service name: {:?}",
            service
        );
        return None;
    }

    let row = sqlx::query_as::<_, ServiceTokenRow>(concat!(
        "SELECT service, encrypted_token FROM ",
        "ch_service_tokens",
        " WHERE service = $1"
    ))
    .bind(service)
    .fetch_optional(&state.db)
    .await
    .ok()??;

    // Warn if token is stored in plaintext (backward compat: still decrypt)
    if !row.encrypted_token.starts_with("enc:") {
        tracing::warn!(
            "Service token for '{}' is stored in plaintext — re-store to encrypt",
            service
        );
    }

    decrypt_token(&row.encrypted_token)
}

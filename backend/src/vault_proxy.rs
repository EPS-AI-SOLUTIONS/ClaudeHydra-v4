//! Vault proxy handlers — forward frontend Vault requests to Jaskier Vault MCP.
//!
//! These endpoints allow the frontend to interact with Jaskier Vault without
//! knowing the internal Vault URL. All calls are proxied through the CH backend,
//! keeping the Vault address internal to the server process.
//!
//! Endpoints:
//! - `GET  /api/vault/health` — forward to VaultClient health check (public)
//! - `GET  /api/vault/audit`  — forward to Vault audit log (public)
//! - `POST /api/vault/panic`  — trigger Vault panic mode (PROTECTED)
//! - `POST /api/vault/rotate` — trigger credential rotation (PROTECTED)

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::{Value, json};

use crate::ai_gateway::vault_bridge::HasVaultBridge;
use crate::state::AppState;

/// GET /api/vault/health — forward to VaultClient health check.
pub async fn vault_health(State(state): State<AppState>) -> impl IntoResponse {
    let status = state.vault_client().health().await;
    Json(serde_json::to_value(status).unwrap_or_else(|_| json!({"online": false})))
}

/// GET /api/vault/audit — forward to Vault audit endpoint.
pub async fn vault_audit(State(state): State<AppState>) -> impl IntoResponse {
    let vault_url = state.vault_client().vault_url();
    let url = format!("{}/api/vault/audit", vault_url);

    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => {
            let body: Value = resp.json().await.unwrap_or(json!([]));
            (StatusCode::OK, Json(body))
        }
        Ok(resp) => {
            let status = resp.status().as_u16();
            (
                StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
                Json(json!({"error": "vault_audit_failed", "status": status})),
            )
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": "vault_unreachable", "message": e.to_string()})),
        ),
    }
}

/// POST /api/vault/panic — trigger Vault panic mode (PROTECTED).
///
/// Forwards the panic signal to Vault MCP Server which immediately
/// invalidates all credentials and revokes active tickets.
pub async fn vault_panic(State(state): State<AppState>) -> impl IntoResponse {
    let vault_url = state.vault_client().vault_url();
    let url = format!("{}/api/vault/panic", vault_url);
    let client = reqwest::Client::new();

    match client.post(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body: Value = resp
                .json()
                .await
                .unwrap_or(json!({"status": "panic_executed"}));
            (StatusCode::OK, Json(body))
        }
        Ok(resp) => {
            let status = resp.status().as_u16();
            (
                StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
                Json(json!({"error": "vault_panic_failed", "status": status})),
            )
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": "vault_unreachable", "message": e.to_string()})),
        ),
    }
}

/// POST /api/vault/rotate — trigger credential auto-rotation (PROTECTED).
///
/// Forwards the rotate signal to Vault MCP Server which generates fresh
/// credentials for all registered auto-rotation entries.
pub async fn vault_rotate(State(state): State<AppState>) -> impl IntoResponse {
    let vault_url = state.vault_client().vault_url();
    let url = format!("{}/api/vault/rotate", vault_url);
    let client = reqwest::Client::new();

    match client.post(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body: Value = resp
                .json()
                .await
                .unwrap_or(json!({"status": "rotate_executed"}));
            (StatusCode::OK, Json(body))
        }
        Ok(resp) => {
            let status = resp.status().as_u16();
            (
                StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
                Json(json!({"error": "vault_rotate_failed", "status": status})),
            )
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": "vault_unreachable", "message": e.to_string()})),
        ),
    }
}

//! Anthropic API client helpers — credential resolution, request building, retry.
//!
//! Provides the shared infrastructure used by both streaming and non-streaming
//! chat handlers to communicate with the Anthropic Messages API:
//!
//! - [`get_anthropic_credential`] — 3-tier resolution: Vault → runtime keys → env var
//! - [`build_anthropic_request`] — builds a `reqwest::RequestBuilder` with auth headers
//! - [`send_to_anthropic_once`] — single attempt with Vault Bouncer delegation
//! - [`send_to_anthropic`]      — circuit-breaker + one retry on 429/5xx
//! - [`send_to_anthropic_via_vault`] — zero-trust delegation path

use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::ai_gateway::vault_bridge::HasVaultBridge;
use crate::state::AppState;

use super::is_retryable_status;

/// Get the Anthropic credential with resolution strategy:
/// 1. First try: Jaskier Vault (`ai_providers/anthropic_max`)
/// 2. Fallback: Runtime API keys (hot-loaded from DB)
/// 3. Last resort: `ANTHROPIC_API_KEY` env var
///
/// B13: Removed old DB OAuth path (`get_valid_anthropic_access_token`).
/// Credentials now come from Vault or environment variables.
///
/// Returns `(token_or_key, is_oauth)`.
pub(crate) async fn get_anthropic_credential(state: &AppState) -> Option<(String, bool)> {
    // 1. Try Vault first (ai_providers/anthropic_max)
    match state
        .vault_client()
        .get("ai_providers", "anthropic_max")
        .await
    {
        Ok(cred) if cred.is_connected => {
            tracing::info!(
                "Using Vault credential for Anthropic (plan: {:?})",
                cred.plan_tier
            );
            return Some(("__vault_managed__".to_string(), true));
        }
        Ok(cred) => {
            tracing::debug!(
                "Vault has Anthropic credential but not connected (is_connected={}), falling back",
                cred.is_connected
            );
        }
        Err(crate::ai_gateway::vault_bridge::VaultError::NotFound) => {
            tracing::debug!("Vault has no Anthropic credential, falling back to env var");
        }
        Err(crate::ai_gateway::vault_bridge::VaultError::AnomalyDetected(msg)) => {
            tracing::error!(
                "ANOMALY DETECTED from Vault during credential resolution: {}",
                msg
            );
            return None;
        }
        Err(e) => {
            tracing::debug!("Vault unavailable ({}), falling back to env var", e);
        }
    }

    // 2. Try runtime state (hot-loaded API key)
    {
        let rt = state.runtime.read().await;
        if let Some(key) = rt.api_keys.get("ANTHROPIC_API_KEY")
            && !key.is_empty()
        {
            tracing::info!("Falling back to runtime API key for Anthropic");
            return Some((key.clone(), false));
        }
    }
    // 3. Last resort: env var
    let key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
    if !key.is_empty() {
        tracing::info!("Falling back to ANTHROPIC_API_KEY env var for Anthropic");
        return Some((key, false));
    }

    None
}

/// Build a `reqwest::RequestBuilder` targeting the Anthropic Messages API.
///
/// Sets the appropriate auth header based on credential type:
/// - OAuth Bearer token: `Authorization: Bearer <token>`
/// - API key:            `X-Api-Key: <key>`
pub(crate) fn build_anthropic_request(
    state: &AppState,
    body: &Value,
    credential: &str,
    timeout_secs: u64,
    is_oauth: bool,
) -> reqwest::RequestBuilder {
    let mut req = state
        .http_client
        .post("https://api.anthropic.com/v1/messages")
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .header("content-type", "application/json")
        .header("anthropic-version", "2023-06-01");

    if is_oauth {
        req = req.header("authorization", format!("Bearer {}", credential));
    } else {
        req = req.header("x-api-key", credential);
    }

    req.json(body)
}

/// Send a single request to Anthropic (no retry).
///
/// When Vault is the active credential source (`__vault_managed__`), this
/// delegates the upstream HTTP call through the Vault Bouncer — the raw token
/// never leaves the Vault process. For non-Vault credentials, uses the direct
/// API request path.
pub(crate) async fn send_to_anthropic_once(
    state: &AppState,
    body: &Value,
    timeout_secs: u64,
) -> Result<reqwest::Response, (StatusCode, Json<Value>)> {
    let (credential, is_oauth) = get_anthropic_credential(state).await.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "No Anthropic API key configured" })),
        )
    })?;

    // ── Vault Bouncer path ────────────────────────────────────────────────
    if credential == "__vault_managed__" {
        return send_to_anthropic_via_vault(state, body, timeout_secs).await;
    }

    // ── Direct path (API key) ─────────────────────────────────────────────
    let resp = build_anthropic_request(state, body, &credential, timeout_secs, is_oauth)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("anthropic proxy: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "AI provider request failed" })),
            )
        })?;

    // If OAuth returned 401, fallback to API key
    if is_oauth && resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        tracing::warn!("OAuth token rejected (401), falling back to API key");
        if let Some((api_key, false)) = get_anthropic_api_key_only(state).await {
            return build_anthropic_request(state, body, &api_key, timeout_secs, false)
                .send()
                .await
                .map_err(|e| {
                    tracing::error!("anthropic proxy fallback: {}", e);
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(json!({ "error": "AI provider request failed" })),
                    )
                });
        }
    }

    Ok(resp)
}

/// Send a request to Anthropic through the Vault Bouncer (zero-trust delegation).
///
/// The Vault decrypts the credential, injects the Bearer token, and makes the
/// upstream HTTP call. This backend receives only the response — the raw token
/// never enters our process memory.
///
/// Returns a synthetic `reqwest::Response` built from the Vault delegate response,
/// preserving the existing contract expected by `send_to_anthropic`.
async fn send_to_anthropic_via_vault(
    state: &AppState,
    body: &Value,
    _timeout_secs: u64,
) -> Result<reqwest::Response, (StatusCode, Json<Value>)> {
    let vault = state.vault_client();

    let delegate_result = vault
        .delegate(
            "https://api.anthropic.com/v1/messages",
            "POST",
            "ai_providers",
            "anthropic_max",
            Some(body.clone()),
        )
        .await;

    match delegate_result {
        Ok(vault_resp) => {
            tracing::debug!(
                "Vault Bouncer delegate completed (status={}, latency={}ms)",
                vault_resp.status,
                vault_resp.latency_ms
            );

            let status_code = reqwest::StatusCode::from_u16(vault_resp.status)
                .unwrap_or(reqwest::StatusCode::BAD_GATEWAY);

            let response_bytes = serde_json::to_vec(&vault_resp.body).unwrap_or_default();
            let http_resp = http::Response::builder()
                .status(status_code)
                .header("content-type", "application/json")
                .body(response_bytes)
                .map_err(|e| {
                    tracing::error!("Failed to build synthetic response: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": "Internal error building Vault response" })),
                    )
                })?;

            Ok(reqwest::Response::from(http_resp))
        }
        Err(crate::ai_gateway::vault_bridge::VaultError::AnomalyDetected(msg)) => {
            tracing::error!("ANOMALY DETECTED during Vault delegate: {}", msg);
            Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": "Security anomaly detected — operations halted" })),
            ))
        }
        Err(e) => {
            tracing::warn!(
                "Vault Bouncer delegate failed ({}), falling back to direct path",
                e
            );

            if let Some((api_key, false)) = get_anthropic_api_key_only(state).await {
                tracing::info!("Vault delegate failed — falling back to API key");
                return build_anthropic_request(state, body, &api_key, _timeout_secs, false)
                    .send()
                    .await
                    .map_err(|e| {
                        tracing::error!("anthropic proxy (vault fallback): {}", e);
                        (
                            StatusCode::BAD_GATEWAY,
                            Json(json!({ "error": "AI provider request failed" })),
                        )
                    });
            }

            Err((
                StatusCode::BAD_GATEWAY,
                Json(
                    json!({ "error": format!("Vault delegate failed and no fallback available: {}", e) }),
                ),
            ))
        }
    }
}

/// Get Anthropic API key only (skip OAuth/Vault). Used as fallback credential.
pub(crate) async fn get_anthropic_api_key_only(state: &AppState) -> Option<(String, bool)> {
    {
        let rt = state.runtime.read().await;
        if let Some(key) = rt.api_keys.get("ANTHROPIC_API_KEY")
            && !key.is_empty()
        {
            return Some((key.clone(), false));
        }
    }
    std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
        .map(|k| (k, false))
}

/// Send to Anthropic with circuit breaker + one retry on 429/5xx.
///
/// Gates on the circuit breaker before any request. On transient failure
/// (429 or 5xx), waits 2 s and retries once before returning the result.
pub(crate) async fn send_to_anthropic(
    state: &AppState,
    body: &Value,
    timeout_secs: u64,
) -> Result<reqwest::Response, (StatusCode, Json<Value>)> {
    // Circuit breaker gate
    if let Err(msg) = state.circuit_breaker.check().await {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": msg
            })),
        ));
    }

    let resp = send_to_anthropic_once(state, body, timeout_secs).await?;

    if resp.status().is_success() {
        state.circuit_breaker.record_success().await;
        Ok(resp)
    } else if is_retryable_status(resp.status().as_u16()) {
        state.circuit_breaker.record_failure().await;
        // Retry once with 2s backoff
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let retry_resp = send_to_anthropic_once(state, body, timeout_secs).await?;
        if retry_resp.status().is_success() {
            state.circuit_breaker.record_success().await;
        } else {
            state.circuit_breaker.record_failure().await;
        }
        Ok(retry_resp)
    } else {
        Ok(resp)
    }
}

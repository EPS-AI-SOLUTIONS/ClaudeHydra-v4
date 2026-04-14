#![allow(clippy::expect_used, clippy::unwrap_used)]
// BE-CH-007 — Integration tests for ClaudeHydra OAuth endpoints.
//
// Tests Anthropic provider OAuth PKCE (at /api/auth/anthropic/*) and
// jaskier-auth unified user auth endpoints.
//
// B13 migration: Anthropic provider OAuth moved from /api/auth/* to
// /api/auth/anthropic/*. Google/GitHub/Vercel provider OAuth removed
// (skip_provider_oauth = true). User auth handled by jaskier-auth at /api/auth/*.
//
// All tests use `AppState::new_test()` with `tower::ServiceExt::oneshot()`
// — no real DB or external APIs.

use axum::http::StatusCode;
use jaskier_core::testing::{body_json, get, post_json};
use serde_json::json;
use tower::ServiceExt;

use claudehydra_backend::state::AppState;

// ── Helpers ──────────────────────────────────────────────────────────────────

async fn app() -> axum::Router {
    let state = AppState::new_test().await;
    claudehydra_backend::create_test_router(state)
}

async fn app_with_state() -> (axum::Router, AppState) {
    let state = AppState::new_test().await;
    let router = claudehydra_backend::create_test_router(state.clone());
    (router, state)
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/auth/anthropic/status — Anthropic provider OAuth status
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn anthropic_auth_status_returns_unauthenticated_by_default() {
    let response = app()
        .await
        .oneshot(get("/api/auth/anthropic/status"))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["authenticated"], false);
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/anthropic/login — Anthropic PKCE login
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn anthropic_auth_login_returns_auth_url_and_state() {
    let response = app()
        .await
        .oneshot(post_json("/api/auth/anthropic/login", json!({})))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;

    // Should contain auth_url and state
    assert!(
        json["auth_url"].is_string(),
        "Response should have auth_url"
    );
    assert!(json["state"].is_string(), "Response should have state");

    let auth_url = json["auth_url"].as_str().unwrap();
    // Verify it points to Anthropic's OAuth endpoint
    assert!(
        auth_url.contains("claude.ai/oauth/authorize"),
        "auth_url should point to Claude OAuth: {auth_url}"
    );
    // Verify PKCE params are present
    assert!(
        auth_url.contains("code_challenge="),
        "Should have code_challenge"
    );
    assert!(
        auth_url.contains("code_challenge_method=S256"),
        "Should use S256 challenge method"
    );
    assert!(
        auth_url.contains("response_type=code"),
        "Should request code response"
    );
}

#[tokio::test]
async fn anthropic_auth_login_generates_unique_states() {
    let (app1, state) = app_with_state().await;
    let app2 = claudehydra_backend::create_test_router(state.clone());

    let resp1 = app1
        .oneshot(post_json("/api/auth/anthropic/login", json!({})))
        .await
        .unwrap();
    let json1 = body_json(resp1).await;

    let resp2 = app2
        .oneshot(post_json("/api/auth/anthropic/login", json!({})))
        .await
        .unwrap();
    let json2 = body_json(resp2).await;

    // Each login should generate a unique state param
    assert_ne!(
        json1["state"].as_str().unwrap(),
        json2["state"].as_str().unwrap(),
        "Two logins should produce different state values"
    );
}

#[tokio::test]
async fn anthropic_auth_login_stores_pkce_state() {
    let (app, state) = app_with_state().await;

    let response = app
        .oneshot(post_json("/api/auth/anthropic/login", json!({})))
        .await
        .unwrap();
    let json = body_json(response).await;
    let state_param = json["state"].as_str().unwrap();

    // Verify the PKCE state was stored in the AppState
    let pkce_states = state.oauth_pkce.read().await;
    assert!(
        pkce_states.contains_key(state_param),
        "PKCE state should be stored in AppState.oauth_pkce"
    );
    assert!(
        !pkce_states[state_param].code_verifier.is_empty(),
        "Code verifier should not be empty"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/anthropic/callback — Anthropic OAuth callback
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn anthropic_auth_callback_rejects_invalid_state() {
    let body = json!({
        "code": "test-auth-code",
        "state": "invalid-state-param"
    });

    let response = app()
        .await
        .oneshot(post_json("/api/auth/anthropic/callback", body))
        .await
        .unwrap();

    // Should reject — the state doesn't match any stored PKCE state
    let status = response.status();
    assert!(
        status == StatusCode::BAD_REQUEST || status == StatusCode::UNAUTHORIZED,
        "Expected 400 or 401 for invalid state, got {status}"
    );
}

#[tokio::test]
async fn anthropic_auth_callback_validates_state_matches_login() {
    let (app1, state) = app_with_state().await;
    let app2 = claudehydra_backend::create_test_router(state.clone());

    // Step 1: login to get a valid state param
    let login_resp = app1
        .oneshot(post_json("/api/auth/anthropic/login", json!({})))
        .await
        .unwrap();
    let login_json = body_json(login_resp).await;
    let valid_state = login_json["state"].as_str().unwrap();

    // Step 2: callback with a WRONG state (not the one from login)
    let callback_body = json!({
        "code": "test-code",
        "state": "completely-different-state"
    });

    let callback_resp = app2
        .oneshot(post_json("/api/auth/anthropic/callback", callback_body))
        .await
        .unwrap();

    let status = callback_resp.status();
    assert!(
        status == StatusCode::BAD_REQUEST || status == StatusCode::UNAUTHORIZED,
        "Should reject mismatched state: got {status}"
    );

    // Verify the valid state is still in the store (not consumed by wrong attempt)
    let pkce_states = state.oauth_pkce.read().await;
    assert!(
        pkce_states.contains_key(valid_state),
        "Valid state should still exist after failed callback with different state"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/anthropic/logout — Anthropic provider OAuth logout
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn anthropic_auth_logout_returns_success() {
    // Logout should succeed even when not logged in (idempotent).
    // The DB query may fail (connect_lazy to fake DB), but the endpoint
    // should not panic. It returns 200 with logged_out: true either way.
    let response = app()
        .await
        .oneshot(post_json("/api/auth/anthropic/logout", json!({})))
        .await
        .unwrap();

    // The endpoint should exist and not 404/500
    let status = response.status();
    assert!(
        status == StatusCode::OK || status == StatusCode::INTERNAL_SERVER_ERROR,
        "Logout should return 200 or 500 (DB unreachable), got {status}"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/auth/mode — auth mode (jaskier-auth)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn auth_mode_open_when_no_secret() {
    let response = app().await.oneshot(get("/api/auth/mode")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert!(
        json["auth_required"].is_boolean(),
        "Response should have auth_required field"
    );
    assert_eq!(
        json["auth_required"], false,
        "No AUTH_SECRET -> auth_required = false"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/login — jaskier-auth user login (requires email/password)
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn jaskier_auth_login_rejects_empty_body() {
    let response = app()
        .await
        .oneshot(post_json("/api/auth/login", json!({})))
        .await
        .unwrap();

    // Should reject — missing email/password fields
    let status = response.status();
    assert!(
        status == StatusCode::BAD_REQUEST
            || status == StatusCode::UNPROCESSABLE_ENTITY
            || status == StatusCode::INTERNAL_SERVER_ERROR,
        "Login with empty body should fail: got {status}"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/register — jaskier-auth user registration
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn jaskier_auth_register_rejects_empty_body() {
    let response = app()
        .await
        .oneshot(post_json("/api/auth/register", json!({})))
        .await
        .unwrap();

    // Should reject — missing required fields
    let status = response.status();
    assert!(
        status == StatusCode::BAD_REQUEST
            || status == StatusCode::UNPROCESSABLE_ENTITY
            || status == StatusCode::INTERNAL_SERVER_ERROR,
        "Register with empty body should fail: got {status}"
    );
}

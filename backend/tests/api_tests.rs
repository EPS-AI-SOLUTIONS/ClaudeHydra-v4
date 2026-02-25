use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use claudehydra_backend::state::AppState;

/// Helper: build a fresh app router with a clean in-memory AppState.
/// Uses `connect_lazy` — no real database connection required.
fn app() -> axum::Router {
    let state = AppState::new_test();
    claudehydra_backend::create_router(state)
}

/// Helper: collect a response body into a serde_json::Value.
async fn body_json(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/health
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn health_returns_200() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn health_has_correct_fields() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let json = body_json(response).await;

    // new_test() doesn't call mark_ready(), so status is "starting"
    assert_eq!(json["status"], "starting");
    assert_eq!(json["version"], "4.0.0");
    assert_eq!(json["app"], "ClaudeHydra");
    assert!(json["uptime_seconds"].is_u64());
    assert!(json["providers"].is_array());
    // No ollama_connected field anymore
    assert!(json.get("ollama_connected").is_none());
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/auth/mode
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn auth_mode_returns_200() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/auth/mode")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    // new_test() sets auth_secret = None → auth not required
    assert_eq!(json["auth_required"], false);
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/health/ready
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn readiness_returns_503_before_ready() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/health/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // new_test() does not call mark_ready(), so should be 503
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/agents
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn agents_returns_200() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/agents")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn agents_returns_12_agents() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/agents")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let json = body_json(response).await;
    let agents = json.as_array().unwrap();
    assert_eq!(agents.len(), 12);
}

#[tokio::test]
async fn agents_have_required_fields() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/agents")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let json = body_json(response).await;
    let agents = json.as_array().unwrap();

    for agent in agents {
        assert!(agent["id"].is_string(), "agent missing id");
        assert!(agent["name"].is_string(), "agent missing name");
        assert!(agent["role"].is_string(), "agent missing role");
        assert!(agent["tier"].is_string(), "agent missing tier");
        assert!(agent["status"].is_string(), "agent missing status");
        assert!(agent["model"].is_string(), "agent missing model");
    }
}

#[tokio::test]
async fn agents_have_correct_model_per_tier() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/agents")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let json = body_json(response).await;
    let agents = json.as_array().unwrap();

    for agent in agents {
        let tier = agent["tier"].as_str().unwrap();
        let model = agent["model"].as_str().unwrap();
        match tier {
            "Commander" => assert_eq!(model, "claude-opus-4-6"),
            "Coordinator" => assert_eq!(model, "claude-sonnet-4-6"),
            "Executor" => assert_eq!(model, "claude-haiku-4-5-20251001"),
            _ => panic!("Unknown tier: {}", tier),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/settings/api-key
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn set_api_key_returns_200() {
    let body = serde_json::json!({
        "provider": "anthropic",
        "key": "test-key-12345"
    });

    let response = app()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/settings/api-key")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["status"], "ok");
    assert_eq!(json["provider"], "anthropic");
}

// ═══════════════════════════════════════════════════════════════════════════
//  404 for unknown routes
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn unknown_route_returns_404() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/nonexistent")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

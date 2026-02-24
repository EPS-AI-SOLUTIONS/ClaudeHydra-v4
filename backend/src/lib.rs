pub mod handlers;
pub mod model_registry;
pub mod models;
pub mod oauth;
pub mod state;
pub mod tools;

use axum::routing::{delete, get, post};
use axum::Router;

use state::AppState;

/// Build the application router with the given shared state.
/// Extracted from `main()` so integration tests can construct the app
/// without binding to a network port.
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Health & system
        .route("/api/health", get(handlers::health_check))
        .route("/api/system/stats", get(handlers::system_stats))
        // Agents
        .route("/api/agents", get(handlers::list_agents))
        // Claude API
        .route("/api/claude/models", get(handlers::claude_models))
        // Model registry
        .route("/api/models", get(model_registry::list_models))
        .route("/api/models/refresh", post(model_registry::refresh_models))
        .route("/api/models/pin", post(model_registry::pin_model))
        .route("/api/models/pin/{use_case}", delete(model_registry::unpin_model))
        .route("/api/models/pins", get(model_registry::list_pins))
        .route("/api/claude/chat", post(handlers::claude_chat))
        .route(
            "/api/claude/chat/stream",
            post(handlers::claude_chat_stream),
        )
        // OAuth authentication
        .route("/api/auth/status", get(oauth::auth_status))
        .route("/api/auth/login", post(oauth::auth_login))
        .route("/api/auth/callback", post(oauth::auth_callback))
        .route("/api/auth/logout", post(oauth::auth_logout))
        // Settings
        .route(
            "/api/settings",
            get(handlers::get_settings).post(handlers::update_settings),
        )
        .route("/api/settings/api-key", post(handlers::set_api_key))
        // Sessions & history
        .route(
            "/api/sessions",
            get(handlers::list_sessions).post(handlers::create_session),
        )
        .route(
            "/api/sessions/{id}",
            get(handlers::get_session)
                .patch(handlers::update_session)
                .delete(handlers::delete_session),
        )
        .route(
            "/api/sessions/{id}/messages",
            post(handlers::add_session_message),
        )
        // Shared state
        .with_state(state)
}

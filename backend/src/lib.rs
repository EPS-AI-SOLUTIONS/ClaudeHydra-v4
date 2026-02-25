pub mod auth;
pub mod handlers;
pub mod model_registry;
pub mod models;
pub mod oauth;
pub mod state;
pub mod system_monitor;
pub mod tools;
pub mod watchdog;

use axum::extract::DefaultBodyLimit;
use axum::middleware;
use axum::routing::{delete, get, post};
use axum::Router;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use state::AppState;

// ── OpenAPI documentation ────────────────────────────────────────────────────

#[derive(OpenApi)]
#[openapi(
    info(
        title = "ClaudeHydra v4 API",
        version = "4.0.0",
        description = "AI Swarm Control Center — Backend API",
        license(name = "MIT")
    ),
    paths(
        // Health
        handlers::health_check,
        handlers::readiness,
        handlers::auth_mode,
        handlers::system_stats,
        // Agents
        handlers::list_agents,
        // Chat
        handlers::claude_models,
        handlers::claude_chat,
        handlers::claude_chat_stream,
        // Settings
        handlers::get_settings,
        handlers::update_settings,
        handlers::set_api_key,
        // Sessions
        handlers::list_sessions,
        handlers::create_session,
        handlers::get_session,
        handlers::update_session,
        handlers::delete_session,
        handlers::add_session_message,
        // Model registry
        model_registry::list_models,
        model_registry::refresh_models,
        model_registry::pin_model,
        model_registry::unpin_model,
        model_registry::list_pins,
    ),
    components(schemas(
        // Core models
        models::HealthResponse,
        models::ProviderInfo,
        models::SystemStats,
        // Agents
        models::WitcherAgent,
        // Chat
        models::ChatRequest,
        models::ChatMessage,
        models::ChatResponse,
        models::UsageInfo,
        models::ClaudeModelInfo,
        // Settings
        models::AppSettings,
        models::ApiKeyRequest,
        // Sessions
        models::Session,
        models::SessionSummary,
        models::HistoryEntry,
        models::ToolInteractionInfo,
        models::CreateSessionRequest,
        models::UpdateSessionRequest,
        models::AddMessageRequest,
        // Model registry
        model_registry::ModelInfo,
        model_registry::ResolvedModels,
        model_registry::PinModelRequest,
    )),
    tags(
        (name = "health", description = "Health & readiness endpoints"),
        (name = "auth", description = "Authentication & API key management"),
        (name = "agents", description = "Agent configuration"),
        (name = "chat", description = "Claude chat & streaming"),
        (name = "settings", description = "Application settings"),
        (name = "sessions", description = "Chat session management"),
        (name = "models", description = "Dynamic model registry & pinning"),
        (name = "system", description = "System monitoring"),
    )
)]
pub struct ApiDoc;

/// Build the application router with the given shared state.
/// Extracted from `main()` so integration tests can construct the app
/// without binding to a network port.
pub fn create_router(state: AppState) -> Router {
    // ── Public routes (no auth) ──────────────────────────────────────
    let public = Router::new()
        .route("/api/health", get(handlers::health_check))
        .route("/api/health/ready", get(handlers::readiness))
        .route("/api/auth/status", get(oauth::auth_status))
        .route("/api/auth/login", post(oauth::auth_login))
        .route("/api/auth/callback", post(oauth::auth_callback))
        .route("/api/auth/logout", post(oauth::auth_logout))
        .route("/api/auth/mode", get(handlers::auth_mode));

    // ── Protected routes (require auth when AUTH_SECRET is set) ──────
    let protected = Router::new()
        .route("/api/system/stats", get(handlers::system_stats))
        .route("/api/agents", get(handlers::list_agents))
        .route("/api/claude/models", get(handlers::claude_models))
        .route("/api/models", get(model_registry::list_models))
        .route("/api/models/refresh", post(model_registry::refresh_models))
        .route("/api/models/pin", post(model_registry::pin_model))
        .route(
            "/api/models/pin/{use_case}",
            delete(model_registry::unpin_model),
        )
        .route("/api/models/pins", get(model_registry::list_pins))
        .route("/api/claude/chat", post(handlers::claude_chat))
        .route(
            "/api/claude/chat/stream",
            post(handlers::claude_chat_stream),
        )
        .route(
            "/api/settings",
            get(handlers::get_settings).post(handlers::update_settings),
        )
        .route("/api/settings/api-key", post(handlers::set_api_key))
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
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth,
        ));

    public
        .merge(protected)
        // Swagger UI — no auth required
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        // 60 MB body limit — must be before .with_state() for Json extractor
        .layer(DefaultBodyLimit::max(60 * 1024 * 1024))
        .with_state(state)
}

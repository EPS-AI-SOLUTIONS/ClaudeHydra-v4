//! ClaudeHydra v4 backend — library root.
//!
//! ## Module layout
//! - `app_routes`   — Axum route group builders (CH-specific sub-routers)
//! - `vault_proxy`  — Vault proxy handler implementations
//! - `state`        — `AppState` + all trait implementations
//! - `models`       — API types split into db_rows / chat_models / ws_protocol / agent_models
//! - `handlers`     — HTTP handler modules + `anthropic_client` credential helpers
//! - `ai_gateway`   — Unified AI provider gateway (Skarbiec Krasnali)
//! - `auth`         — Auth middleware wrappers
//! - `tools`        — Agent tool executor
//! - ... (other feature modules)

pub mod ai_gateway;
pub mod app_routes;
pub mod audit;
pub mod auth;
pub mod auto_qa;
pub mod browser_proxy;
pub mod collab;
pub mod extractor;
pub mod handlers;
pub mod mcp;
pub mod memory_pruning;
pub mod model_registry;
pub mod models;
pub mod ocr;
pub mod rate_limits;
pub mod sandbox;
pub mod semantic_cache;
pub mod state;
pub mod state_agent_helpers;
pub mod swarm;
pub mod system_monitor;
pub mod tools;
pub mod vault_proxy;
pub mod watchdog;

use axum::Router;
use jaskier_core::router_builder::{
    HydraRouterConfig, build_hydra_router, build_hydra_test_router,
};
use utoipa::OpenApi;

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
        handlers::system_metrics,
        handlers::system_audit,
        // Agents
        handlers::list_agents,
        handlers::get_agent,
        handlers::create_agent,
        handlers::update_agent,
        handlers::delete_agent,
        handlers::list_delegations,
        handlers::delegations_stream,
        // Chat
        handlers::claude_models,
        handlers::claude_chat,
        handlers::claude_chat_stream,
        // Settings
        handlers::get_settings,
        handlers::update_settings,
        handlers::set_api_key,
        // Sessions (local overrides with utoipa annotations)
        handlers::get_session,
        handlers::add_session_message,
        // Tags & search
        handlers::get_session_tags,
        handlers::add_session_tags,
        handlers::delete_session_tag,
        handlers::search_sessions,
        handlers::list_all_tags,
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
        models::SystemMetricsResponse,
        models::MetricItem,
        models::NetworkMetric,
        // Agents
        models::WitcherAgent,
        models::CreateAgentRequest,
        models::UpdateAgentRequest,
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
        // Prompt history
        models::AddPromptRequest,
        // Tags
        handlers::tags::AddTagsRequest,
        handlers::tags::SearchResult,
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
        (name = "tags", description = "Session tagging & full-text search"),
    )
)]
pub struct ApiDoc;

// ═══════════════════════════════════════════════════════════════════════
//  HydraRouterConfig builder
// ═══════════════════════════════════════════════════════════════════════

/// Assemble the `HydraRouterConfig` that wires all CH-specific sub-routers
/// into the shared `build_hydra_router` foundation.
///
/// Route groups are defined in `app_routes.rs`. See that module for per-group
/// documentation on which endpoints each group exposes and what auth applies.
fn build_ch_config(state: AppState) -> HydraRouterConfig<AppState> {
    HydraRouterConfig {
        // B13: jaskier-auth now owns /api/auth/* for user authentication.
        // Provide an empty override to suppress the shared router's default
        // Google OAuth routes which would conflict with jaskier-auth routes.
        primary_auth_override: Some(Router::new()),

        // WebSocket streaming (Anthropic-native via claude_chat_stream fallback)
        ws_route: app_routes::ch_ws_route(),

        // Streaming + non-streaming Claude chat (auth + rate limiting applied by builder)
        execute_routes: app_routes::ch_chat_routes(),

        // Pre-built sub-routers (already have auth middleware)
        agents_router: app_routes::ch_agents_router(state.clone()),
        files_router: app_routes::ch_files_router(state.clone()),
        system_router: app_routes::ch_system_router(state.clone()),

        // Browser proxy routes (public, no auth)
        browser_proxy_routes: app_routes::ch_browser_proxy_routes(),

        // OCR routes (auth applied by shared router's protected group)
        ocr_routes: app_routes::ch_ocr_routes(),

        // CH-specific protected routes (auth applied by builder)
        app_protected_routes: app_routes::ch_app_protected_routes(),

        // CH has no ADK sidecar bridge
        internal_tool_route: Router::new(),

        // Prometheus metrics
        metrics_router: app_routes::ch_metrics_router(),

        // OpenAPI spec
        openapi: ApiDoc::openapi(),
        // B13: Mount jaskier-auth unified auth routes at /api/auth/*
        jaskier_auth_routes: Some(
            Router::new().nest("/api/auth", jaskier_auth::auth_router::<AppState>()),
        ),
        // B13: Skip legacy Google/GitHub/Vercel OAuth routes — jaskier-auth handles all auth
        skip_provider_oauth: true,
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — application router constructors
// ═══════════════════════════════════════════════════════════════════════

/// Build the application router with the given shared state.
///
/// Extracted from `main()` so integration tests can construct the app
/// without binding to a network port.
///
/// Uses `build_hydra_router` from jaskier-core as the foundation.
/// CH-specific routes are injected via `HydraRouterConfig` (see `build_ch_config`).
///
/// The ai_gateway router is merged BEFORE the HydraRouter (higher priority) to
/// ensure `/api/ai/*` and `/api/vault/*` routes take precedence.
///
/// B13: Unified user auth via jaskier-auth. Anthropic provider OAuth routes
/// moved to `/api/auth/anthropic/*` to avoid conflicts with user auth.
pub fn create_router(state: AppState) -> Router {
    let hydra_router = build_hydra_router(state.clone(), build_ch_config(state.clone()));

    // ai_gateway + feature routes merged first — higher priority
    let gateway_routes = ai_gateway::handlers::ai_gateway_router::<AppState>()
        .merge(app_routes::ch_vault_public_routes())
        .merge(app_routes::ch_vault_protected_routes(state.clone()))
        .merge(app_routes::ch_anthropic_provider_auth_routes())
        .merge(app_routes::ch_auto_qa_routes())
        .merge(app_routes::ch_profiling_routes())
        .merge(jaskier_swarm::swarm_router::<AppState>())
        .merge(jaskier_collab::collab_router::<AppState>())
        .merge(semantic_cache::handlers::semantic_cache_router::<AppState>())
        .merge(sandbox::sandbox_router::<AppState>())
        .merge(memory_pruning::memory_pruning_router::<AppState>())
        .with_state(state.clone());

    // PERF: HTTP latency tracking + ETag middleware
    gateway_routes
        .merge(hydra_router)
        .layer(axum::middleware::from_fn(
            jaskier_core::etag::etag_middleware,
        ))
        .layer(axum::middleware::from_fn_with_state(
            state,
            jaskier_core::profiling::latency_middleware::<AppState>,
        ))
}

/// Test-only router — identical routes but **without** `GovernorLayer` rate
/// limiting. `tower_governor` extracts the peer IP via `ConnectInfo`, which
/// is absent in `oneshot()` integration tests, causing a blanket 500 error.
/// Removing the layer keeps all handler logic intact for pure in-memory tests.
#[doc(hidden)]
pub fn create_test_router(state: AppState) -> Router {
    let hydra_router = build_hydra_test_router(state.clone(), build_ch_config(state.clone()));

    let gateway_routes = ai_gateway::handlers::ai_gateway_router::<AppState>()
        .merge(app_routes::ch_vault_public_routes())
        .merge(app_routes::ch_vault_protected_routes(state.clone()))
        .merge(app_routes::ch_anthropic_provider_auth_routes())
        .merge(app_routes::ch_auto_qa_routes())
        .merge(app_routes::ch_profiling_routes())
        .merge(jaskier_collab::collab_router::<AppState>())
        .merge(semantic_cache::handlers::semantic_cache_router::<AppState>())
        .merge(sandbox::sandbox_router::<AppState>())
        .merge(memory_pruning::memory_pruning_router::<AppState>())
        .with_state(state.clone());

    gateway_routes
        .merge(hydra_router)
        .layer(axum::middleware::from_fn(
            jaskier_core::etag::etag_middleware,
        ))
        .layer(axum::middleware::from_fn_with_state(
            state,
            jaskier_core::profiling::latency_middleware::<AppState>,
        ))
}

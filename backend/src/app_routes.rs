//! ClaudeHydra route group builders — assembles all Axum sub-routers.
//!
//! Each function builds one logical group of routes and applies the appropriate
//! auth middleware. These are assembled into a `HydraRouterConfig` by
//! `build_ch_config()` and consumed by `build_hydra_router` in `lib.rs`.
//!
//! ## Route groups
//! - `ch_anthropic_provider_auth_routes` — Anthropic PKCE OAuth (provider credential)
//! - `ch_ws_route`           — WebSocket streaming at `/ws/chat`
//! - `ch_chat_routes`        — SSE + non-streaming Claude chat
//! - `ch_agents_router`      — Agent CRUD + delegation monitoring (auth)
//! - `ch_files_router`       — File list + native folder browser (auth)
//! - `ch_system_router`      — System stats + admin endpoints (auth + API key)
//! - `ch_browser_proxy_routes` — Browser proxy status/control (public)
//! - `ch_ocr_routes`         — OCR endpoints (auth via shared router)
//! - `ch_app_protected_routes` — Analytics, tags, claude/models (auth)
//! - `ch_metrics_router`     — Prometheus `/api/metrics` (public)
//! - `ch_profiling_routes`   — Web Vitals `/api/vitals` (public, beacon API)
//! - `ch_vault_public_routes`    — Vault health/audit (public)
//! - `ch_vault_protected_routes` — Vault panic/rotate (auth)
//! - `ch_auto_qa_routes`     — Grafana webhook endpoint (public)

use axum::Router;
use axum::routing::{delete, get, patch, post};

use crate::auth;
use crate::browser_proxy;
use crate::handlers;
use crate::ocr;
use crate::rate_limits;
use crate::state::AppState;
use crate::vault_proxy;

/// Anthropic OAuth PKCE routes — provider credential management (NOT user auth).
///
/// Served at `/api/auth/anthropic/*` since B13: jaskier-auth now owns `/api/auth/*`
/// for user authentication.
pub(crate) fn ch_anthropic_provider_auth_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/auth/anthropic/status",
            get(jaskier_net_sec::oauth::anthropic::anthropic_auth_status::<AppState>),
        )
        .route(
            "/api/auth/anthropic/login",
            post(jaskier_net_sec::oauth::anthropic::anthropic_auth_login::<AppState>),
        )
        .route(
            "/api/auth/anthropic/callback",
            post(jaskier_net_sec::oauth::anthropic::anthropic_auth_callback::<AppState>),
        )
        .route(
            "/api/auth/anthropic/logout",
            post(jaskier_net_sec::oauth::anthropic::anthropic_auth_logout::<AppState>),
        )
}

/// WebSocket chat route at `/ws/chat` (maps to `ws_route` config slot).
pub(crate) fn ch_ws_route() -> Router<AppState> {
    Router::new().route("/ws/chat", get(handlers::ws_chat))
}

/// Streaming + non-streaming Claude chat routes (maps to `execute_routes` slot).
/// Auth + rate limiting applied by `build_hydra_router`.
pub(crate) fn ch_chat_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/claude/chat/stream",
            post(handlers::claude_chat_stream),
        )
        .route("/api/claude/chat", post(handlers::claude_chat))
        .route("/api/prefetch/hints", post(handlers::prefetch_hints))
}

/// Agent CRUD + delegation monitoring (auth applied via `route_layer`).
pub(crate) fn ch_agents_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route(
            "/api/agents",
            get(handlers::list_agents).post(handlers::create_agent),
        )
        .route(
            "/api/agents/{id}",
            get(handlers::get_agent)
                .put(handlers::update_agent)
                .delete(handlers::delete_agent),
        )
        .route("/api/agents/refresh", post(handlers::refresh_agents))
        .route("/api/agents/delegations", get(handlers::list_delegations))
        .route(
            "/api/agents/delegations/stream",
            get(handlers::delegations_stream),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            auth::jaskier_auth_require_auth::<AppState>,
        ))
}

/// File listing and native folder browser (auth applied via `route_layer`).
pub(crate) fn ch_files_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/files/list", post(handlers::list_files))
        .route("/api/files/browse", post(handlers::browse_directory))
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            auth::jaskier_auth_require_auth::<AppState>,
        ))
}

/// System stats, admin, and API-key-authenticated routes.
///
/// Note: `/api/health*` and `/api/auth/mode` are provided by `build_hydra_router`
/// via `HasHealthState` — NOT registered here to avoid duplicate-route panics.
pub(crate) fn ch_system_router(state: AppState) -> Router<AppState> {
    // Protected system endpoints (require user auth)
    let protected = Router::new()
        .route("/api/system/stats", get(handlers::system_stats))
        .route("/api/admin/rotate-key", post(handlers::rotate_key))
        .route(
            "/api/admin/rate-limits",
            get(rate_limits::list_rate_limits::<AppState>),
        )
        .route(
            "/api/admin/rate-limits/{endpoint_group}",
            patch(rate_limits::update_rate_limit::<AppState>),
        )
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::jaskier_auth_require_auth::<AppState>,
        ));

    // API key auth required for metrics/audit
    let api_key_auth = Router::new()
        .route("/api/system/metrics", get(handlers::system_metrics))
        .route("/api/system/audit", get(handlers::system_audit))
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            auth::require_api_key_auth,
        ));

    protected.merge(api_key_auth)
}

/// Browser proxy routes (public, no auth).
///
/// Note: `/api/browser-proxy/history` is provided by `build_hydra_router`
/// via the shared browser proxy history handler — NOT registered here.
pub(crate) fn ch_browser_proxy_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/browser-proxy/status",
            get(browser_proxy::proxy_status::<AppState>),
        )
        .route(
            "/api/browser-proxy/login",
            post(browser_proxy::proxy_login::<AppState>),
        )
        .route(
            "/api/browser-proxy/login/status",
            get(browser_proxy::proxy_login_status::<AppState>),
        )
        .route(
            "/api/browser-proxy/reinit",
            post(browser_proxy::proxy_reinit::<AppState>),
        )
        .route(
            "/api/browser-proxy/logout",
            delete(browser_proxy::proxy_logout::<AppState>),
        )
}

/// OCR routes (auth applied by the shared router's protected group).
pub(crate) fn ch_ocr_routes() -> Router<AppState> {
    Router::new()
        .route("/api/ocr", post(ocr::ocr))
        .route("/api/ocr/stream", post(ocr::ocr_stream))
        .route("/api/ocr/batch/stream", post(ocr::ocr_batch_stream))
        .route("/api/ocr/history", get(ocr::ocr_history))
        .route(
            "/api/ocr/history/{id}",
            get(ocr::ocr_history_item).delete(ocr::ocr_history_delete),
        )
}

/// CH-specific protected routes — analytics, tags, settings, claude/models.
///
/// Auth is applied by `build_hydra_router` (passed as `app_protected_routes`).
///
/// Excluded here (handled by the shared router):
/// - `/api/models*`       — shared model registry handlers
/// - `/api/logs/backend`  — shared log ring buffer
/// - `/api/tokens*`       — shared service token handlers
/// - `/api/sessions*`     — shared session CRUD
/// - `/mcp`, `/api/mcp/*` — shared MCP endpoints
pub(crate) fn ch_app_protected_routes() -> Router<AppState> {
    Router::new()
        // Claude model list (CH-specific — Anthropic models, not Google)
        .route("/api/claude/models", get(handlers::claude_models))
        // Session search (literal path, NOT in shared session_routes)
        .route("/api/sessions/search", get(handlers::search_sessions))
        // Session tags (NOT in shared session_routes)
        .route(
            "/api/sessions/{id}/tags",
            get(handlers::get_session_tags).post(handlers::add_session_tags),
        )
        .route(
            "/api/sessions/{id}/tags/{tag}",
            delete(handlers::delete_session_tag),
        )
        // Global tags listing
        .route("/api/tags", get(handlers::list_all_tags))
        // Settings API key endpoint (CH-specific)
        .route("/api/settings/api-key", post(handlers::set_api_key))
        // Analytics — agent performance dashboard
        .route("/api/analytics/tokens", get(handlers::analytics_tokens))
        .route("/api/analytics/latency", get(handlers::analytics_latency))
        .route(
            "/api/analytics/success-rate",
            get(handlers::analytics_success_rate),
        )
        .route(
            "/api/analytics/top-tools",
            get(handlers::analytics_top_tools),
        )
        .route("/api/analytics/cost", get(handlers::analytics_cost))
}

/// Prometheus metrics endpoint (public, no auth).
pub(crate) fn ch_metrics_router() -> Router<AppState> {
    Router::new().route(
        "/api/metrics",
        get(jaskier_core::metrics::metrics_handler::<AppState>),
    )
}

/// Web Vitals collection + profiling routes (public, no auth — beacon API).
pub(crate) fn ch_profiling_routes() -> Router<AppState> {
    Router::new().route(
        "/api/vitals",
        post(jaskier_core::profiling::vitals_handler::<AppState>),
    )
}

/// Vault proxy public endpoints (health + audit — no auth required).
pub(crate) fn ch_vault_public_routes() -> Router<AppState> {
    Router::new()
        .route("/api/vault/health", get(vault_proxy::vault_health))
        .route("/api/vault/audit", get(vault_proxy::vault_audit))
}

/// Vault proxy protected endpoints (panic + rotate — auth required).
pub(crate) fn ch_vault_protected_routes(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/vault/panic", post(vault_proxy::vault_panic))
        .route("/api/vault/rotate", post(vault_proxy::vault_rotate))
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            auth::jaskier_auth_require_auth::<AppState>,
        ))
}

/// Grafana webhook for auto-QA incident routing.
pub(crate) fn ch_auto_qa_routes() -> Router<AppState> {
    Router::new().route(
        "/api/webhooks/grafana",
        post(crate::auto_qa::grafana_webhook::<AppState>),
    )
}

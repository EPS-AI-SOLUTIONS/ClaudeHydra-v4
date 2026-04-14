// Jaskier Shared Pattern -- model_registry
//
// ClaudeHydra v4 -- Dynamic Model Registry
// Core types (ModelInfo, ModelCache, PinModelRequest) and utility functions
// (version_key, select_best, classify_complexity, refresh_cache) are provided
// by the shared `jaskier-core` crate.
//
// ClaudeHydra keeps its own `ResolvedModels` and `resolve_models` since its
// use cases (commander/coordinator/executor/flash) differ from the Gemini-focused
// shared defaults (chat/thinking/image/flash).

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::header;
use axum::response::IntoResponse;
use serde::Serialize;
use serde_json::{Value, json};
use utoipa::ToSchema;

use crate::state::AppState;

// ── Re-export shared types from jaskier-core ──────────────────────────────────
pub use jaskier_core::model_registry::{
    ModelCache, ModelInfo, PinModelRequest, classify_complexity, refresh_cache, select_best,
    version_key,
};

// ── ClaudeHydra-specific: Anthropic tier resolution ───────────────────────────

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ResolvedModels {
    pub commander: Option<ModelInfo>,   // opus
    pub coordinator: Option<ModelInfo>, // sonnet
    pub executor: Option<ModelInfo>,    // haiku
    pub flash: Option<ModelInfo>,       // gemini flash (fast tasks)
}

/// Resolve the best model for each use case from the cached models.
/// ClaudeHydra resolves Anthropic tiers (commander/coordinator/executor) + Google flash.
pub async fn resolve_models(state: &AppState) -> ResolvedModels {
    use jaskier_core::model_registry::HasModelRegistryState;

    {
        let cache = state.model_cache().read().await;
        if cache.is_stale() {
            drop(cache);
            let _ = refresh_cache(state).await;
        }
    }

    let cache = state.model_cache().read().await;
    let anthropic = cache.models.get("anthropic").cloned().unwrap_or_default();

    // Commander: latest opus (prefer non-dated, fallback to dated)
    let commander = select_best(&anthropic, &["opus"], &["20"])
        .or_else(|| select_best(&anthropic, &["opus"], &[]));

    // Coordinator: latest sonnet (prefer non-dated)
    let coordinator = select_best(&anthropic, &["sonnet"], &["20"])
        .or_else(|| select_best(&anthropic, &["sonnet"], &[]));

    // Executor: latest haiku (prefer non-dated)
    let executor = select_best(&anthropic, &["haiku"], &["20"])
        .or_else(|| select_best(&anthropic, &["haiku"], &[]));

    // Flash: latest Google Flash model for fast simple tasks
    let google = cache.models.get("google").cloned().unwrap_or_default();
    let flash = select_best(
        &google,
        &["flash"],
        &[
            "lite", "latest", "image", "tts", "computer", "robotics", "audio", "thinking",
        ],
    );

    ResolvedModels {
        commander,
        coordinator,
        executor,
        flash,
    }
}

/// Get the model ID for a given tier/use case.
/// Priority: 1) DB pin  2) dynamic auto-selection  3) hardcoded fallback.
pub async fn get_model_id(state: &AppState, use_case: &str) -> String {
    // 1) Check for a pinned model in DB
    let pinned: Option<String> =
        sqlx::query_scalar("SELECT model_id FROM ch_model_pins WHERE use_case = $1")
            .bind(use_case)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    if let Some(ref pin) = pinned {
        tracing::info!(
            "model_registry: use_case={} → model={} (pinned)",
            use_case,
            pin
        );
        return pin.clone();
    }

    // 2) Dynamic auto-selection
    let resolved = resolve_models(state).await;

    let (model, fallback) = match use_case {
        "commander" | "Commander" => (resolved.commander, "claude-opus-4-6"),
        "coordinator" | "Coordinator" => (resolved.coordinator, "claude-sonnet-4-6"),
        "executor" | "Executor" => (resolved.executor, "claude-haiku-4-5-20251001"),
        "flash" | "Flash" => (resolved.flash, "gemini-3.1-flash-preview"),
        _ => (resolved.coordinator, "claude-sonnet-4-6"),
    };

    let id = model.as_ref().map(|m| m.id.as_str()).unwrap_or(fallback);

    tracing::info!(
        "model_registry: use_case={} → model={}{}",
        use_case,
        id,
        if model.is_some() {
            " (auto)"
        } else {
            " (fallback)"
        }
    );

    id.to_string()
}

/// Map a tier name to the current best model ID (used by agent init).
pub async fn model_for_tier(state: &AppState, tier: &str) -> String {
    get_model_id(state, tier).await
}

// ── HTTP handlers ────────────────────────────────────────────────────────────

/// Read all pins from DB as a HashMap.
async fn get_pins_map(state: &AppState) -> HashMap<String, String> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT use_case, model_id FROM ch_model_pins")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

    rows.into_iter().collect()
}

// ── Startup sync ─────────────────────────────────────────────────────────────

/// Called once at startup: fetch models from API, pick the best per tier,
/// and persist the coordinator model as `default_model` in `ch_settings`.
pub async fn startup_sync(state: &AppState) {
    tracing::info!("model_registry: fetching models at startup\u{2026}");

    let (models, startup_errors) = refresh_cache(state).await;
    let total: usize = models.values().map(std::vec::Vec::len).sum();
    tracing::info!(
        "model_registry: {} models cached from {} providers",
        total,
        models.len()
    );
    for err in &startup_errors {
        tracing::warn!("model_registry: startup fetch error: {}", err);
    }

    let resolved = resolve_models(state).await;

    // Persist coordinator (default chat model) into ch_settings
    if let Some(ref best) = resolved.coordinator {
        tracing::info!("model_registry: best coordinator model → {}", best.id);

        let res = sqlx::query(
            "UPDATE ch_settings SET default_model = $1, updated_at = NOW() WHERE id = 1",
        )
        .bind(&best.id)
        .execute(&state.db)
        .await;

        match res {
            Ok(_) => tracing::info!("model_registry: default_model updated to {}", best.id),
            Err(e) => tracing::warn!("model_registry: failed to update default_model: {}", e),
        }
    } else {
        tracing::warn!("model_registry: no coordinator model resolved — keeping DB default");
    }

    tracing::info!(
        "model_registry: resolved → commander={}, coordinator={}, executor={}, flash={}",
        resolved
            .commander
            .as_ref()
            .map(|m| m.id.as_str())
            .unwrap_or("(none)"),
        resolved
            .coordinator
            .as_ref()
            .map(|m| m.id.as_str())
            .unwrap_or("(none)"),
        resolved
            .executor
            .as_ref()
            .map(|m| m.id.as_str())
            .unwrap_or("(none)"),
        resolved
            .flash
            .as_ref()
            .map(|m| m.id.as_str())
            .unwrap_or("(none)"),
    );
}

// --- Shared Handlers ---

/// GET /api/models — Return all cached models + resolved selections + pins
#[utoipa::path(get, path = "/api/models", tag = "models",
    responses((status = 200, description = "Cached models, resolved selections, and pins", body = Value))
)]
pub async fn list_models(State(state): State<AppState>) -> impl IntoResponse {
    use jaskier_core::model_registry::HasModelRegistryState;

    let resolved = resolve_models(&state).await;
    let pins = get_pins_map(&state).await;
    let cache = state.model_cache().read().await;

    let total: usize = cache.models.values().map(std::vec::Vec::len).sum();
    let stale = cache.is_stale();
    let fetched_ago = cache.fetched_at.map(|t| t.elapsed().as_secs());

    let body = Json(json!({
        "total_models": total,
        "cache_stale": stale,
        "cache_age_seconds": fetched_ago,
        "pins": pins,
        "selected": {
            "commander": resolved.commander,
            "coordinator": resolved.coordinator,
            "executor": resolved.executor,
            "flash": resolved.flash,
        },
        "providers": {
            "anthropic": cache.models.get("anthropic").cloned().unwrap_or_default(),
            "google": cache.models.get("google").cloned().unwrap_or_default(),
        }
    }));

    // #6 — Cache static model list for 60 seconds
    ([(header::CACHE_CONTROL, "public, max-age=60")], body)
}

/// POST /api/models/refresh — Force refresh of model cache
#[utoipa::path(post, path = "/api/models/refresh", tag = "models",
    responses((status = 200, description = "Refreshed model cache", body = Value))
)]
pub async fn refresh_models(State(state): State<AppState>) -> Json<Value> {
    let (models, errors) = refresh_cache(&state).await;
    let resolved = resolve_models(&state).await;
    let pins = get_pins_map(&state).await;

    let total: usize = models.values().map(std::vec::Vec::len).sum();

    let mut resp = json!({
        "refreshed": true,
        "total_models": total,
        "pins": pins,
        "selected": {
            "commander": resolved.commander,
            "coordinator": resolved.coordinator,
            "executor": resolved.executor,
            "flash": resolved.flash,
        }
    });
    if !errors.is_empty() {
        for err in &errors {
            tracing::error!("model registry refresh: {}", err);
        }
        resp["errors"] = json!(format!("{} provider(s) failed to refresh", errors.len()));
    }
    Json(resp)
}

/// POST /api/models/pin — Pin a specific model to a tier
#[utoipa::path(post, path = "/api/models/pin", tag = "models",
    request_body = PinModelRequest,
    responses((status = 200, description = "Model pinned", body = Value))
)]
pub async fn pin_model(
    State(state): State<AppState>,
    Json(body): Json<PinModelRequest>,
) -> Json<Value> {
    let normalized = body.use_case.to_lowercase();
    let valid = ["commander", "coordinator", "executor", "flash"];

    if !valid.contains(&normalized.as_str()) {
        return Json(
            json!({ "error": format!("Invalid use_case '{}'. Valid: commander, coordinator, executor, flash", body.use_case) }),
        );
    }

    let result = sqlx::query(
        "INSERT INTO ch_model_pins (use_case, model_id) \
         VALUES ($1, $2) \
         ON CONFLICT (use_case) DO UPDATE SET model_id = $2, pinned_at = now()",
    )
    .bind(&normalized)
    .bind(&body.model_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            tracing::info!(
                "model_registry: pinned use_case={} → model={}",
                normalized,
                body.model_id
            );
            // #40 Audit log
            crate::audit::log_audit(
                &state.db,
                "pin_model",
                json!({ "use_case": normalized, "model_id": body.model_id }),
                None,
            )
            .await;
            Json(json!({ "pinned": true, "use_case": normalized, "model_id": body.model_id }))
        }
        Err(e) => {
            tracing::error!(
                "model registry: failed to pin use_case={} model={}: {}",
                normalized,
                body.model_id,
                e
            );
            Json(json!({ "error": "Internal database error" }))
        }
    }
}

/// DELETE /api/models/pin/{use_case} — Unpin a tier (delegates to jaskier-core)
#[utoipa::path(delete, path = "/api/models/pin/{use_case}", tag = "models",
    params(("use_case" = String, Path, description = "Use case to unpin")),
    responses((status = 200, description = "Model unpinned", body = Value))
)]
pub async fn unpin_model(state: State<AppState>, use_case: Path<String>) -> Json<Value> {
    jaskier_core::model_registry::unpin_model(state, use_case).await
}

/// GET /api/models/pins — List all active pins (delegates to jaskier-core)
#[utoipa::path(get, path = "/api/models/pins", tag = "models",
    responses((status = 200, description = "All active model pins", body = Value))
)]
pub async fn list_pins(state: State<AppState>) -> Json<Value> {
    jaskier_core::model_registry::list_pins(state).await
}

#[cfg(test)]
mod tests {
    use super::*;

    // version_key and select_best tests live in jaskier-core::model_registry.
    // Only ClaudeHydra-specific tests (ModelCache, ResolvedModels) belong here.

    // ── ModelCache ───────────────────────────────────────────────────────

    #[test]
    fn model_cache_new_is_stale() {
        let cache = ModelCache::new();
        assert!(cache.is_stale());
    }

    #[test]
    fn model_cache_default_is_stale() {
        let cache = ModelCache::default();
        assert!(cache.is_stale());
    }

    #[test]
    fn model_cache_fresh_after_set() {
        let mut cache = ModelCache::new();
        cache.fetched_at = Some(std::time::Instant::now());
        assert!(!cache.is_stale());
    }

    #[test]
    fn model_cache_empty_models_by_default() {
        let cache = ModelCache::new();
        assert!(cache.models.is_empty());
    }
}

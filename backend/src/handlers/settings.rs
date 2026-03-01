//! Application settings endpoints (DB-backed).

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::models::*;
use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/settings
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(get, path = "/api/settings", tag = "settings",
    responses((status = 200, description = "Current application settings")))]
pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let row = sqlx::query_as::<_, SettingsRow>(
        "SELECT theme, language, default_model, auto_start, welcome_message, working_directory, \
         COALESCE(max_iterations, 10) AS max_iterations, \
         COALESCE(temperature, 0.7) AS temperature, \
         COALESCE(max_tokens, 4096) AS max_tokens \
         FROM ch_settings WHERE id = 1",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch settings: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let settings = AppSettings {
        theme: row.theme,
        language: row.language,
        default_model: row.default_model,
        auto_start: row.auto_start,
        welcome_message: row.welcome_message,
        working_directory: row.working_directory,
        max_iterations: row.max_iterations,
        temperature: row.temperature,
        max_tokens: row.max_tokens,
    };

    Ok(Json(serde_json::to_value(settings).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?))
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/settings
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(post, path = "/api/settings", tag = "settings",
    request_body = AppSettings,
    responses((status = 200, description = "Updated settings")))]
pub async fn update_settings(
    State(state): State<AppState>,
    Json(new_settings): Json<AppSettings>,
) -> Result<Json<Value>, StatusCode> {
    // Validate working_directory if non-empty
    if !new_settings.working_directory.is_empty()
        && !std::path::Path::new(&new_settings.working_directory).is_dir()
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    sqlx::query(
        "UPDATE ch_settings SET theme = $1, language = $2, default_model = $3, \
         auto_start = $4, welcome_message = $5, working_directory = $6, max_iterations = $7, \
         temperature = $8, max_tokens = $9, updated_at = NOW() WHERE id = 1",
    )
    .bind(&new_settings.theme)
    .bind(&new_settings.language)
    .bind(&new_settings.default_model)
    .bind(new_settings.auto_start)
    .bind(&new_settings.welcome_message)
    .bind(&new_settings.working_directory)
    .bind(new_settings.max_iterations.max(1).min(50))
    .bind(new_settings.temperature.clamp(0.0, 2.0))
    .bind(new_settings.max_tokens.max(256).min(16384))
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update settings: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    crate::audit::log_audit(
        &state.db,
        "update_settings",
        serde_json::to_value(&new_settings).unwrap_or_default(),
        None,
    )
    .await;

    Ok(Json(serde_json::to_value(&new_settings).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?))
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/settings/api-key
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(post, path = "/api/settings/api-key", tag = "auth",
    request_body = ApiKeyRequest,
    responses((status = 200, description = "API key saved")))]
pub async fn set_api_key(
    State(state): State<AppState>,
    Json(req): Json<ApiKeyRequest>,
) -> Json<Value> {
    let mut rt = state.runtime.write().await;
    rt.api_keys.insert(req.provider.clone(), req.key);
    Json(json!({ "status": "ok", "provider": req.provider }))
}

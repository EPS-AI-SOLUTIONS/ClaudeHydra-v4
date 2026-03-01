//! Agent listing and refresh endpoints.

use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  GET /api/agents
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(
    get,
    path = "/api/agents",
    tag = "agents",
    responses((status = 200, description = "List of Witcher agents"))
)]
pub async fn list_agents(State(state): State<AppState>) -> Json<Value> {
    let agents = state.agents.read().await;
    Json(serde_json::to_value(&*agents).unwrap_or_else(|_| json!({"error": "serialization failed"})))
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/agents/refresh
// ═══════════════════════════════════════════════════════════════════════

pub async fn refresh_agents(State(state): State<AppState>) -> Json<Value> {
    state.refresh_agents().await;
    let agents = state.agents.read().await;
    Json(json!({
        "status": "refreshed",
        "count": agents.len(),
    }))
}

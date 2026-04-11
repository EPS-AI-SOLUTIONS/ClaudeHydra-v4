//! Agent helper functions for AppState initialization and refresh.
//!
//! Provides DB-backed loading and default initialization of the CH-specific
//! `WitcherAgent` roster (which differs from the shared `jaskier_core::models::WitcherAgent`
//! by including an explicit `model` field assigned based on tier).
//!
//! These functions are kept separate from the main `state.rs` to reduce its size
//! and to allow unit-testing agent initialization without constructing a full AppState.

use sqlx::PgPool;

use crate::models::{AgentConfigRow, WitcherAgent};

/// Map a tier name to the canonical Anthropic model ID for that tier.
///
/// - `"Commander"` → `claude-opus-4-6`
/// - `"Coordinator"` → `claude-sonnet-4-6`
/// - `"Executor"` → `claude-haiku-4-5-20251001`
/// - other → `claude-sonnet-4-6` (safe default)
pub(crate) fn model_for_tier(tier: &str) -> &'static str {
    match tier {
        "Commander" => "claude-opus-4-6",
        "Coordinator" => "claude-sonnet-4-6",
        "Executor" => "claude-haiku-4-5-20251001",
        _ => "claude-sonnet-4-6",
    }
}

/// Build the default agent roster from the shared jaskier-core list, converting
/// to CH's local `WitcherAgent` type which adds an Anthropic `model` field.
///
/// Used as fallback when the DB is empty or unavailable.
pub(crate) fn init_witcher_agents() -> Vec<WitcherAgent> {
    jaskier_core::models::default_agent_roster()
        .into_iter()
        .map(|shared| WitcherAgent {
            model: model_for_tier(&shared.tier).to_string(),
            id: shared.id,
            name: shared.name,
            role: shared.role,
            tier: shared.tier,
            status: shared.status,
            description: shared.description,
        })
        .collect()
}

/// Load agents from `ch_agents_config` table.
///
/// Falls back to hardcoded defaults when the table doesn't exist yet or is empty.
/// Emits `tracing::info` / `tracing::warn` logs for observability.
pub(crate) async fn load_agents_from_db(db: &PgPool) -> Vec<WitcherAgent> {
    match sqlx::query_as::<_, AgentConfigRow>(
        "SELECT id, name, role, tier, status, description, model, created_at, updated_at \
         FROM ch_agents_config ORDER BY id",
    )
    .fetch_all(db)
    .await
    {
        Ok(rows) if !rows.is_empty() => {
            tracing::info!("Loaded {} agents from DB (ch_agents_config)", rows.len());
            rows.into_iter().map(WitcherAgent::from).collect()
        }
        Ok(_) => {
            tracing::info!("ch_agents_config is empty — using hardcoded defaults");
            init_witcher_agents()
        }
        Err(e) => {
            tracing::warn!(
                "Failed to load agents from DB ({}), using hardcoded defaults",
                e
            );
            init_witcher_agents()
        }
    }
}

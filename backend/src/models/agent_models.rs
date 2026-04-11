//! Agent configuration types — WitcherAgent struct, DB row, and request bodies.
//!
//! These types support the agent CRUD API at `/api/agents/*` and the
//! `ch_agents_config` PostgreSQL table.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::models::db_rows::AgentConfigRow;

/// A ClaudeHydra agent (CH-local type, includes `model` field derived from tier).
///
/// Differs from `jaskier_core::models::WitcherAgent` by including an explicit
/// `model: String` field assigned based on the agent's tier at load time.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WitcherAgent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub tier: String,
    pub status: String,
    pub description: String,
    /// Anthropic model ID assigned based on tier (claude-opus/sonnet/haiku).
    pub model: String,
}

impl From<AgentConfigRow> for WitcherAgent {
    /// Convert a raw DB row to a `WitcherAgent`.
    fn from(row: AgentConfigRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            role: row.role,
            tier: row.tier,
            status: row.status,
            description: row.description,
            model: row.model,
        }
    }
}

/// Request body for creating a new agent via `POST /api/agents`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateAgentRequest {
    pub name: String,
    pub role: String,
    pub tier: String,
    #[serde(default = "default_agent_status")]
    pub status: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub model: String,
}

fn default_agent_status() -> String {
    "active".to_string()
}

/// Request body for partially updating an existing agent via `PUT /api/agents/{id}`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UpdateAgentRequest {
    pub name: Option<String>,
    pub role: Option<String>,
    pub tier: Option<String>,
    pub status: Option<String>,
    pub description: Option<String>,
    pub model: Option<String>,
}

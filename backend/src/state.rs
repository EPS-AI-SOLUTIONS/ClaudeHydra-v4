use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::models::WitcherAgent;
use crate::tools::ToolExecutor;

/// Mutable runtime state (not persisted — lost on restart).
pub struct RuntimeState {
    pub api_keys: HashMap<String, String>,
}

/// Central application state. Clone-friendly — PgPool and Arc are both Clone.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub agents: Vec<WitcherAgent>,
    pub runtime: Arc<RwLock<RuntimeState>>,
    pub start_time: Instant,
    pub client: reqwest::Client,
    pub tool_executor: Arc<ToolExecutor>,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        let mut api_keys = HashMap::new();
        if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
            api_keys.insert("ANTHROPIC_API_KEY".to_string(), key);
        }
        if let Ok(key) = std::env::var("GOOGLE_API_KEY") {
            api_keys.insert("GOOGLE_API_KEY".to_string(), key);
        }

        let agents = init_witcher_agents();

        tracing::info!(
            "AppState initialised — {} agents, keys: {:?}",
            agents.len(),
            api_keys.keys().collect::<Vec<_>>()
        );

        Self {
            db,
            agents,
            runtime: Arc::new(RwLock::new(RuntimeState { api_keys })),
            start_time: Instant::now(),
            client: reqwest::Client::new(),
            tool_executor: Arc::new(ToolExecutor::new()),
        }
    }
}

fn model_for_tier(tier: &str) -> &'static str {
    match tier {
        "Commander" => "claude-opus-4-6",
        "Coordinator" => "claude-sonnet-4-5-20250929",
        "Executor" => "claude-haiku-4-5-20251001",
        _ => "claude-sonnet-4-5-20250929",
    }
}

fn init_witcher_agents() -> Vec<WitcherAgent> {
    let defs: &[(&str, &str, &str, &str)] = &[
        ("Geralt",    "Security",      "Commander",  "Master witcher and security specialist — hunts vulnerabilities like monsters"),
        ("Yennefer",  "Architecture",  "Commander",  "Powerful sorceress of system architecture — designs elegant magical structures"),
        ("Vesemir",   "Testing",       "Commander",  "Veteran witcher mentor — rigorously tests and validates all operations"),
        ("Triss",     "Data",          "Coordinator","Skilled sorceress of data management — weaves information with precision"),
        ("Jaskier",   "Documentation", "Coordinator","Legendary bard — chronicles every detail with flair and accuracy"),
        ("Ciri",      "Performance",   "Coordinator","Elder Blood carrier — optimises performance with dimensional speed"),
        ("Dijkstra",  "Strategy",      "Coordinator","Spymaster strategist — plans operations with cunning intelligence"),
        ("Lambert",   "DevOps",        "Executor",   "Bold witcher — executes deployments and infrastructure operations"),
        ("Eskel",     "Backend",       "Executor",   "Steady witcher — builds and maintains robust backend services"),
        ("Regis",     "Research",      "Executor",   "Scholarly higher vampire — researches and analyses with ancient wisdom"),
        ("Zoltan",    "Frontend",      "Executor",   "Dwarven warrior — forges powerful and resilient frontend interfaces"),
        ("Philippa",  "Monitoring",    "Executor",   "All-seeing sorceress — monitors systems with her magical owl familiar"),
    ];

    defs.iter()
        .enumerate()
        .map(|(i, (name, role, tier, desc))| WitcherAgent {
            id: format!("agent-{:03}", i + 1),
            name: name.to_string(),
            role: role.to_string(),
            tier: tier.to_string(),
            status: "active".to_string(),
            description: desc.to_string(),
            model: model_for_tier(tier).to_string(),
        })
        .collect()
}

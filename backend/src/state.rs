// Jaskier Shared Pattern — state
// ClaudeHydra v4 - Application state

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::model_registry::ModelCache;
use crate::models::WitcherAgent;
use crate::tools::ToolExecutor;

// ── Shared: RuntimeState ────────────────────────────────────────────────────
/// Mutable runtime state (not persisted — lost on restart).
pub struct RuntimeState {
    pub api_keys: HashMap<String, String>,
}

/// Temporary PKCE state for an in-progress OAuth flow.
pub struct OAuthPkceState {
    pub code_verifier: String,
    pub state: String,
}

// ── Shared: SystemSnapshot ───────────────────────────────────────────────────
/// Cached system statistics snapshot, refreshed every 5s by background task.
#[derive(Clone)]
pub struct SystemSnapshot {
    pub cpu_usage_percent: f32,
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub platform: String,
}

impl Default for SystemSnapshot {
    fn default() -> Self {
        Self {
            cpu_usage_percent: 0.0,
            memory_used_mb: 0.0,
            memory_total_mb: 0.0,
            platform: std::env::consts::OS.to_string(),
        }
    }
}

// ── Shared: AppState (project-specific fields vary) ─────────────────────────
/// Central application state. Clone-friendly — PgPool and Arc are both Clone.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub agents: Vec<WitcherAgent>,
    pub runtime: Arc<RwLock<RuntimeState>>,
    pub model_cache: Arc<RwLock<ModelCache>>,
    pub start_time: Instant,
    pub client: reqwest::Client,
    pub tool_executor: Arc<ToolExecutor>,
    pub oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>,
    /// `true` once startup_sync completes (or times out).
    pub ready: Arc<AtomicBool>,
    /// Cached system stats (CPU, memory) refreshed every 5s by background task.
    pub system_monitor: Arc<RwLock<SystemSnapshot>>,
    /// Optional auth secret from AUTH_SECRET env. None = dev mode (no auth).
    pub auth_secret: Option<String>,
}

// ── Shared: readiness helpers ───────────────────────────────────────────────
impl AppState {
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    pub fn mark_ready(&self) {
        self.ready.store(true, Ordering::Relaxed);
        tracing::info!("Backend marked as READY");
    }
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

        let auth_secret = std::env::var("AUTH_SECRET").ok().filter(|s| !s.is_empty());
        if auth_secret.is_some() {
            tracing::info!("AUTH_SECRET configured — authentication enabled");
        } else {
            tracing::info!("AUTH_SECRET not set — authentication disabled (dev mode)");
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
            model_cache: Arc::new(RwLock::new(ModelCache::new())),
            start_time: Instant::now(),
            client: reqwest::Client::new(),
            tool_executor: Arc::new(ToolExecutor::new()),
            oauth_pkce: Arc::new(RwLock::new(None)),
            ready: Arc::new(AtomicBool::new(false)),
            system_monitor: Arc::new(RwLock::new(SystemSnapshot::default())),
            auth_secret,
        }
    }
}

fn model_for_tier(tier: &str) -> &'static str {
    match tier {
        "Commander" => "claude-opus-4-6",
        "Coordinator" => "claude-sonnet-4-6",
        "Executor" => "claude-haiku-4-5-20251001",
        _ => "claude-sonnet-4-6",
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

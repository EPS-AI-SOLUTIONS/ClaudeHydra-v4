// Jaskier Shared Pattern — state
// ClaudeHydra v4 - Application state

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Instant;

use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::mcp::client::McpClientManager;
use crate::model_registry::ModelCache;
use crate::models::WitcherAgent;
use crate::tools::ToolExecutor;

// ── Circuit Breaker — Jaskier Shared Pattern ────────────────────────────────
/// Simple circuit breaker for upstream API providers.
///
/// After `FAILURE_THRESHOLD` consecutive failures the circuit **trips** for
/// `COOLDOWN_SECS` seconds. While tripped, `allow_request()` returns `false`
/// so callers can fail fast without hitting the upstream.
///
/// Thread-safe — uses atomics only, no mutex/rwlock.
pub struct CircuitBreaker {
    consecutive_failures: AtomicU32,
    /// `None` = circuit is closed (healthy).
    /// `Some(instant)` = tripped at this wall-clock instant.
    tripped_at: RwLock<Option<Instant>>,
}

const FAILURE_THRESHOLD: u32 = 3;
const COOLDOWN_SECS: u64 = 60;

impl CircuitBreaker {
    pub fn new() -> Self {
        Self {
            consecutive_failures: AtomicU32::new(0),
            tripped_at: RwLock::new(None),
        }
    }

    /// Returns `true` if the circuit is closed (allow the request).
    /// Returns `false` if tripped and the cooldown has NOT elapsed yet.
    /// If the cooldown HAS elapsed, resets the circuit to half-open (allows one request).
    pub async fn allow_request(&self) -> bool {
        let guard = self.tripped_at.read().await;
        if let Some(tripped) = *guard {
            if tripped.elapsed().as_secs() < COOLDOWN_SECS {
                return false;
            }
            // Cooldown elapsed — drop read lock, acquire write, reset to half-open
            drop(guard);
            let mut wg = self.tripped_at.write().await;
            // Double-check under write lock (another task may have reset it)
            if let Some(t) = *wg {
                if t.elapsed().as_secs() >= COOLDOWN_SECS {
                    *wg = None;
                    self.consecutive_failures.store(0, Ordering::Relaxed);
                    tracing::info!("circuit_breaker: cooldown elapsed, resetting to half-open");
                }
            }
        }
        true
    }

    /// Record a successful request — resets the failure counter and closes the circuit.
    pub async fn record_success(&self) {
        let prev = self.consecutive_failures.swap(0, Ordering::Relaxed);
        if prev > 0 {
            let mut wg = self.tripped_at.write().await;
            *wg = None;
            tracing::info!("circuit_breaker: success recorded, circuit closed (was {} failures)", prev);
        }
    }

    /// Record a failed request. Trips the circuit after `FAILURE_THRESHOLD` consecutive failures.
    pub async fn record_failure(&self) {
        let count = self.consecutive_failures.fetch_add(1, Ordering::Relaxed) + 1;
        tracing::warn!("circuit_breaker: failure #{}", count);
        if count >= FAILURE_THRESHOLD {
            let mut wg = self.tripped_at.write().await;
            if wg.is_none() {
                *wg = Some(Instant::now());
                tracing::error!(
                    "circuit_breaker: TRIPPED after {} consecutive failures — blocking requests for {}s",
                    count, COOLDOWN_SECS
                );
            }
        }
    }
}

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
    pub http_client: reqwest::Client,
    pub tool_executor: Arc<ToolExecutor>,
    pub oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>,
    /// Google OAuth PKCE state (separate from Anthropic OAuth PKCE).
    pub google_oauth_pkce: Arc<RwLock<Option<OAuthPkceState>>>,
    /// GitHub OAuth state (CSRF protection for GitHub OAuth flow).
    pub github_oauth_state: Arc<RwLock<Option<String>>>,
    /// Vercel OAuth state (CSRF protection for Vercel OAuth flow).
    pub vercel_oauth_state: Arc<RwLock<Option<String>>>,
    /// `true` once startup_sync completes (or times out).
    pub ready: Arc<AtomicBool>,
    /// Cached system stats (CPU, memory) refreshed every 5s by background task.
    pub system_monitor: Arc<RwLock<SystemSnapshot>>,
    /// Optional auth secret from AUTH_SECRET env. None = dev mode (no auth).
    pub auth_secret: Option<String>,
    /// Circuit breaker for upstream Anthropic API — Jaskier Shared Pattern
    pub circuit_breaker: Arc<CircuitBreaker>,
    /// MCP client manager — connects to external MCP servers
    pub mcp_client: Arc<McpClientManager>,
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

        let http_client = reqwest::Client::builder()
            .pool_max_idle_per_host(10)
            .timeout(std::time::Duration::from_secs(120))
            .connect_timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("Failed to build HTTP client");

        let tool_executor = Arc::new(ToolExecutor::new(
            http_client.clone(),
            api_keys.clone(),
        ));

        let mcp_client = Arc::new(McpClientManager::new(
            db.clone(),
            http_client.clone(),
        ));

        Self {
            db,
            agents,
            runtime: Arc::new(RwLock::new(RuntimeState { api_keys })),
            model_cache: Arc::new(RwLock::new(ModelCache::new())),
            start_time: Instant::now(),
            http_client,
            tool_executor,
            oauth_pkce: Arc::new(RwLock::new(None)),
            google_oauth_pkce: Arc::new(RwLock::new(None)),
            github_oauth_state: Arc::new(RwLock::new(None)),
            vercel_oauth_state: Arc::new(RwLock::new(None)),
            ready: Arc::new(AtomicBool::new(false)),
            system_monitor: Arc::new(RwLock::new(SystemSnapshot::default())),
            auth_secret,
            circuit_breaker: Arc::new(CircuitBreaker::new()),
            mcp_client,
        }
    }

    /// Test-only constructor — uses `connect_lazy` so no real DB is needed.
    /// Only suitable for endpoints that don't issue SQL queries (or that
    /// gracefully handle DB errors, e.g. `.ok()?`).
    #[doc(hidden)]
    pub fn new_test() -> Self {
        let agents = init_witcher_agents();

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("Failed to build HTTP client");

        let db = PgPool::connect_lazy("postgres://test@localhost:19999/test").expect("lazy pool");

        Self {
            mcp_client: Arc::new(McpClientManager::new(db.clone(), http_client.clone())),
            db,
            agents,
            runtime: Arc::new(RwLock::new(RuntimeState { api_keys: HashMap::new() })),
            model_cache: Arc::new(RwLock::new(ModelCache::new())),
            start_time: Instant::now(),
            http_client: http_client.clone(),
            tool_executor: Arc::new(ToolExecutor::new(http_client, HashMap::new())),
            oauth_pkce: Arc::new(RwLock::new(None)),
            google_oauth_pkce: Arc::new(RwLock::new(None)),
            github_oauth_state: Arc::new(RwLock::new(None)),
            vercel_oauth_state: Arc::new(RwLock::new(None)),
            ready: Arc::new(AtomicBool::new(false)),
            system_monitor: Arc::new(RwLock::new(SystemSnapshot::default())),
            auth_secret: None,
            circuit_breaker: Arc::new(CircuitBreaker::new()),
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

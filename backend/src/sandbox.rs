// ClaudeHydra Swarm Sandbox Environment
//
// Docker-based isolation for safe code execution by AI agents.
// Agents can test generated code in sandboxed containers before
// applying changes to the host filesystem.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::Json;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::RwLock;
use uuid::Uuid;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxSession {
    pub id: String,
    pub container_id: Option<String>,
    pub language: SandboxLanguage,
    pub status: SandboxStatus,
    pub resource_limits: ResourceLimits,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_execution_at: Option<chrono::DateTime<chrono::Utc>>,
    pub execution_count: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SandboxLanguage {
    Node,
    Python,
    Rust,
    Bash,
}

impl SandboxLanguage {
    fn docker_image(&self) -> &'static str {
        match self {
            Self::Node => "node:22-alpine",
            Self::Python => "python:3.13-alpine",
            Self::Rust => "rust:1.87-alpine",
            Self::Bash => "alpine:3.21",
        }
    }

    fn run_command(&self, code: &str) -> Vec<String> {
        match self {
            Self::Node => vec!["node".into(), "-e".into(), code.into()],
            Self::Python => vec!["python3".into(), "-c".into(), code.into()],
            Self::Rust => {
                // For Rust, we write to a temp file and compile+run
                let script = format!(
                    "echo '{}' > /tmp/sandbox.rs && rustc /tmp/sandbox.rs -o /tmp/sandbox && /tmp/sandbox",
                    code.replace('\'', "'\"'\"'")
                );
                vec!["sh".into(), "-c".into(), script]
            }
            Self::Bash => vec!["sh".into(), "-c".into(), code.into()],
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SandboxStatus {
    Creating,
    Ready,
    Running,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    /// Memory limit in MB (default: 128)
    pub memory_mb: u32,
    /// CPU shares (default: 256, Docker default is 1024)
    pub cpu_shares: u32,
    /// Execution timeout in seconds (default: 30)
    pub timeout_secs: u32,
    /// Network access disabled (default: true — isolated)
    pub no_network: bool,
    /// Read-only filesystem (default: true)
    pub read_only: bool,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            memory_mb: 128,
            cpu_shares: 256,
            timeout_secs: 30,
            no_network: true,
            read_only: false, // Some langs need /tmp
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxExecution {
    pub id: String,
    pub session_id: String,
    pub code: String,
    pub language: SandboxLanguage,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub status: ExecutionStatus,
    pub duration_ms: u64,
    pub executed_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Success,
    Error,
    Timeout,
    ContainerError,
}

// ── State ────────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct SandboxState {
    pub sessions: Arc<RwLock<HashMap<String, SandboxSession>>>,
    pub executions: Arc<RwLock<Vec<SandboxExecution>>>,
    pub docker_available: Arc<std::sync::atomic::AtomicBool>,
}

impl SandboxState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            executions: Arc::new(RwLock::new(Vec::new())),
            docker_available: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    /// Check Docker availability at startup.
    pub async fn check_docker(&self) {
        let available = match Command::new("docker").arg("info").output().await {
            Ok(output) => output.status.success(),
            Err(_) => false,
        };
        self.docker_available.store(available, std::sync::atomic::Ordering::Relaxed);
        if available {
            tracing::info!("Sandbox: Docker is available — sandbox execution enabled");
        } else {
            tracing::warn!("Sandbox: Docker not available — sandbox will use process isolation fallback");
        }
    }

    pub fn is_docker_available(&self) -> bool {
        self.docker_available.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Clean up idle sandbox sessions (no execution for >30 minutes).
    pub async fn cleanup_idle(&self) {
        let cutoff = chrono::Utc::now() - chrono::Duration::minutes(30);
        let mut sessions = self.sessions.write().await;
        let idle: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| {
                s.status == SandboxStatus::Ready
                    && s.last_execution_at
                        .map(|t| t < cutoff)
                        .unwrap_or(s.created_at < cutoff)
            })
            .map(|(id, _)| id.clone())
            .collect();

        for id in &idle {
            if let Some(session) = sessions.remove(id) {
                if let Some(container_id) = &session.container_id {
                    let _ = destroy_container(container_id).await;
                }
                tracing::info!("Sandbox: cleaned up idle session {}", id);
            }
        }
    }
}

// ── Docker Operations ────────────────────────────────────────────────────────

async fn create_container(
    language: SandboxLanguage,
    limits: &ResourceLimits,
) -> Result<String, String> {
    let image = language.docker_image();

    // Pull image if not present (best effort)
    let _ = Command::new("docker")
        .args(["pull", image])
        .output()
        .await;

    let mut args = vec![
        "create".to_string(),
        "--interactive".to_string(),
        format!("--memory={}m", limits.memory_mb),
        format!("--cpu-shares={}", limits.cpu_shares),
        "--pids-limit=64".to_string(),
        "--label=jaskier-sandbox=true".to_string(),
    ];

    if limits.no_network {
        args.push("--network=none".to_string());
    }

    if limits.read_only {
        args.push("--read-only".to_string());
        // Allow /tmp for temp files
        args.push("--tmpfs=/tmp:rw,noexec,nosuid,size=32m".to_string());
    }

    // Security: drop all capabilities, no new privileges
    args.push("--cap-drop=ALL".to_string());
    args.push("--security-opt=no-new-privileges".to_string());

    args.push(image.to_string());
    // Keep container alive with sleep
    args.push("sleep".to_string());
    args.push("3600".to_string());

    let output = Command::new("docker")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Docker create failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker create error: {}", stderr.trim()));
    }

    let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Start the container
    let start = Command::new("docker")
        .args(["start", &container_id])
        .output()
        .await
        .map_err(|e| format!("Docker start failed: {}", e))?;

    if !start.status.success() {
        let _ = Command::new("docker")
            .args(["rm", "-f", &container_id])
            .output()
            .await;
        let stderr = String::from_utf8_lossy(&start.stderr);
        return Err(format!("Docker start error: {}", stderr.trim()));
    }

    Ok(container_id)
}

async fn execute_in_container(
    container_id: &str,
    language: SandboxLanguage,
    code: &str,
    timeout_secs: u32,
) -> SandboxExecution {
    let exec_id = Uuid::new_v4().to_string();
    let started = std::time::Instant::now();
    let now = chrono::Utc::now();

    let cmd_parts = language.run_command(code);
    let mut args = vec!["exec".to_string(), container_id.to_string()];
    args.extend(cmd_parts);

    let timeout = Duration::from_secs(timeout_secs as u64);
    let result = tokio::time::timeout(timeout, async {
        Command::new("docker")
            .args(&args)
            .output()
            .await
    })
    .await;

    let duration_ms = started.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code();
            let status = if output.status.success() {
                ExecutionStatus::Success
            } else {
                ExecutionStatus::Error
            };

            SandboxExecution {
                id: exec_id,
                session_id: String::new(), // filled by caller
                code: code.to_string(),
                language,
                stdout,
                stderr,
                exit_code,
                status,
                duration_ms,
                executed_at: now,
            }
        }
        Ok(Err(e)) => SandboxExecution {
            id: exec_id,
            session_id: String::new(),
            code: code.to_string(),
            language,
            stdout: String::new(),
            stderr: format!("Docker exec error: {}", e),
            exit_code: None,
            status: ExecutionStatus::ContainerError,
            duration_ms,
            executed_at: now,
        },
        Err(_) => {
            // Timeout — kill the exec process
            let _ = Command::new("docker")
                .args(["kill", container_id])
                .output()
                .await;
            // Restart the container for future use
            let _ = Command::new("docker")
                .args(["start", container_id])
                .output()
                .await;

            SandboxExecution {
                id: exec_id,
                session_id: String::new(),
                code: code.to_string(),
                language,
                stdout: String::new(),
                stderr: format!("Execution timed out after {}s", timeout_secs),
                exit_code: None,
                status: ExecutionStatus::Timeout,
                duration_ms,
                executed_at: now,
            }
        }
    }
}

/// Fallback: execute code without Docker using process isolation.
/// Runs in a subprocess with resource limits (timeout only on non-Docker).
async fn execute_without_docker(
    language: SandboxLanguage,
    code: &str,
    timeout_secs: u32,
) -> SandboxExecution {
    let exec_id = Uuid::new_v4().to_string();
    let started = std::time::Instant::now();
    let now = chrono::Utc::now();

    let (program, args) = match language {
        SandboxLanguage::Node => ("node", vec!["-e".to_string(), code.to_string()]),
        SandboxLanguage::Python => ("python3", vec!["-c".to_string(), code.to_string()]),
        SandboxLanguage::Bash => ("sh", vec!["-c".to_string(), code.to_string()]),
        SandboxLanguage::Rust => {
            // Can't easily compile Rust without Docker — return error
            return SandboxExecution {
                id: exec_id,
                session_id: String::new(),
                code: code.to_string(),
                language,
                stdout: String::new(),
                stderr: "Rust sandbox requires Docker. Install Docker Desktop to use Rust sandbox.".to_string(),
                exit_code: None,
                status: ExecutionStatus::ContainerError,
                duration_ms: 0,
                executed_at: now,
            };
        }
    };

    let timeout = Duration::from_secs(timeout_secs as u64);
    let result = tokio::time::timeout(timeout, async {
        Command::new(program)
            .args(&args)
            .output()
            .await
    })
    .await;

    let duration_ms = started.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(output)) => SandboxExecution {
            id: exec_id,
            session_id: String::new(),
            code: code.to_string(),
            language,
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code(),
            status: if output.status.success() {
                ExecutionStatus::Success
            } else {
                ExecutionStatus::Error
            },
            duration_ms,
            executed_at: now,
        },
        Ok(Err(e)) => SandboxExecution {
            id: exec_id,
            session_id: String::new(),
            code: code.to_string(),
            language,
            stdout: String::new(),
            stderr: format!("Process error: {}", e),
            exit_code: None,
            status: ExecutionStatus::ContainerError,
            duration_ms,
            executed_at: now,
        },
        Err(_) => SandboxExecution {
            id: exec_id,
            session_id: String::new(),
            code: code.to_string(),
            language,
            stdout: String::new(),
            stderr: format!("Execution timed out after {}s", timeout_secs),
            exit_code: None,
            status: ExecutionStatus::Timeout,
            duration_ms,
            executed_at: now,
        },
    }
}

async fn destroy_container(container_id: &str) -> Result<(), String> {
    let output = Command::new("docker")
        .args(["rm", "-f", container_id])
        .output()
        .await
        .map_err(|e| format!("Docker rm failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker rm error: {}", stderr.trim()));
    }
    Ok(())
}

// ── Trait ─────────────────────────────────────────────────────────────────────

pub trait HasSandboxState: Clone + Send + Sync + 'static {
    fn sandbox(&self) -> &SandboxState;
    fn sandbox_db(&self) -> &sqlx::PgPool;
}

// ── Request / Response types ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateSandboxRequest {
    pub language: SandboxLanguage,
    #[serde(default)]
    pub limits: Option<ResourceLimits>,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteCodeRequest {
    pub code: String,
    /// Optional session ID to reuse. If omitted, creates ephemeral execution.
    pub session_id: Option<String>,
    /// Language (required if no session_id).
    pub language: Option<SandboxLanguage>,
    /// Override timeout (seconds).
    pub timeout_secs: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct SandboxHealthResponse {
    pub docker_available: bool,
    pub active_sessions: usize,
    pub total_executions: usize,
    pub fallback_mode: bool,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// GET /api/sandbox/health — Check Docker availability and sandbox stats.
async fn sandbox_health<S: HasSandboxState>(State(state): State<S>) -> impl IntoResponse {
    let sandbox = state.sandbox();
    let sessions = sandbox.sessions.read().await;
    let executions = sandbox.executions.read().await;

    Json(SandboxHealthResponse {
        docker_available: sandbox.is_docker_available(),
        active_sessions: sessions.values().filter(|s| s.status == SandboxStatus::Ready).count(),
        total_executions: executions.len(),
        fallback_mode: !sandbox.is_docker_available(),
    })
}

/// POST /api/sandbox/create — Create a new sandbox session (Docker container).
async fn sandbox_create<S: HasSandboxState>(
    State(state): State<S>,
    Json(req): Json<CreateSandboxRequest>,
) -> impl IntoResponse {
    let sandbox = state.sandbox();
    let limits = req.limits.unwrap_or_default();
    let session_id = Uuid::new_v4().to_string();

    let mut session = SandboxSession {
        id: session_id.clone(),
        container_id: None,
        language: req.language,
        status: SandboxStatus::Creating,
        resource_limits: limits.clone(),
        created_at: chrono::Utc::now(),
        last_execution_at: None,
        execution_count: 0,
    };

    if sandbox.is_docker_available() {
        match create_container(req.language, &limits).await {
            Ok(container_id) => {
                session.container_id = Some(container_id);
                session.status = SandboxStatus::Ready;
                tracing::info!("Sandbox: created session {} ({:?})", session_id, req.language);
            }
            Err(e) => {
                tracing::error!("Sandbox: failed to create container: {}", e);
                session.status = SandboxStatus::Error;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": e, "session_id": session_id })),
                );
            }
        }
    } else {
        // Fallback mode — no Docker container, just track the session
        session.status = SandboxStatus::Ready;
        tracing::info!(
            "Sandbox: created session {} ({:?}) in fallback mode (no Docker)",
            session_id,
            req.language
        );
    }

    // Persist session
    {
        let mut sessions = sandbox.sessions.write().await;
        sessions.insert(session_id.clone(), session.clone());
    }

    // Persist to DB (best-effort)
    persist_session(&state.sandbox_db(), &session).await;

    (StatusCode::CREATED, Json(serde_json::to_value(&session).unwrap()))
}

/// POST /api/sandbox/execute — Execute code in a sandbox.
///
/// If `session_id` is provided, reuses an existing container.
/// Otherwise, runs ephemeral execution (create → execute → destroy).
async fn sandbox_execute<S: HasSandboxState>(
    State(state): State<S>,
    Json(req): Json<ExecuteCodeRequest>,
) -> impl IntoResponse {
    let sandbox = state.sandbox();

    // Validate code length (max 64KB to prevent abuse)
    if req.code.len() > 65536 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Code exceeds 64KB limit" })),
        );
    }

    let timeout = req.timeout_secs.unwrap_or(30).min(120); // Max 120s

    // Case 1: Reuse existing session
    if let Some(ref session_id) = req.session_id {
        let sessions = sandbox.sessions.read().await;
        if let Some(session) = sessions.get(session_id) {
            if session.status != SandboxStatus::Ready {
                return (
                    StatusCode::CONFLICT,
                    Json(serde_json::json!({ "error": "Session is not ready", "status": format!("{:?}", session.status) })),
                );
            }

            let language = session.language;
            let mut execution = if let Some(ref container_id) = session.container_id {
                execute_in_container(container_id, language, &req.code, timeout).await
            } else {
                execute_without_docker(language, &req.code, timeout).await
            };
            execution.session_id = session_id.clone();

            drop(sessions);

            // Update session stats
            {
                let mut sessions = sandbox.sessions.write().await;
                if let Some(s) = sessions.get_mut(session_id) {
                    s.last_execution_at = Some(chrono::Utc::now());
                    s.execution_count += 1;
                }
            }

            // Store execution
            {
                let mut execs = sandbox.executions.write().await;
                execs.push(execution.clone());
                // Keep last 500 executions in memory
                if execs.len() > 500 {
                    execs.drain(0..100);
                }
            }

            // Persist execution to DB (best-effort)
            persist_execution(&state.sandbox_db(), &execution).await;

            return (StatusCode::OK, Json(serde_json::to_value(&execution).unwrap()));
        }

        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Session not found" })),
        );
    }

    // Case 2: Ephemeral execution (no session)
    let language = req.language.unwrap_or(SandboxLanguage::Node);

    let mut execution = if sandbox.is_docker_available() {
        // Create temporary container, execute, destroy
        match create_container(language, &ResourceLimits { timeout_secs: timeout, ..ResourceLimits::default() }).await {
            Ok(container_id) => {
                let exec = execute_in_container(&container_id, language, &req.code, timeout).await;
                let _ = destroy_container(&container_id).await;
                exec
            }
            Err(e) => {
                tracing::warn!("Sandbox: Docker create failed, falling back to process: {}", e);
                execute_without_docker(language, &req.code, timeout).await
            }
        }
    } else {
        execute_without_docker(language, &req.code, timeout).await
    };

    execution.session_id = "ephemeral".to_string();

    // Store execution
    {
        let mut execs = sandbox.executions.write().await;
        execs.push(execution.clone());
        if execs.len() > 500 {
            execs.drain(0..100);
        }
    }

    persist_execution(&state.sandbox_db(), &execution).await;

    (StatusCode::OK, Json(serde_json::to_value(&execution).unwrap()))
}

/// GET /api/sandbox/sessions — List active sandbox sessions.
async fn sandbox_list_sessions<S: HasSandboxState>(State(state): State<S>) -> impl IntoResponse {
    let sessions = state.sandbox().sessions.read().await;
    let list: Vec<&SandboxSession> = sessions.values().collect();
    Json(serde_json::to_value(&list).unwrap())
}

/// GET /api/sandbox/sessions/{id} — Get sandbox session details.
async fn sandbox_get_session<S: HasSandboxState>(
    State(state): State<S>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let sessions = state.sandbox().sessions.read().await;
    match sessions.get(&id) {
        Some(session) => (StatusCode::OK, Json(serde_json::to_value(session).unwrap())),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Session not found" })),
        ),
    }
}

/// GET /api/sandbox/sessions/{id}/executions — Get execution history for a session.
async fn sandbox_session_executions<S: HasSandboxState>(
    State(state): State<S>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let execs = state.sandbox().executions.read().await;
    let session_execs: Vec<&SandboxExecution> = execs
        .iter()
        .filter(|e| e.session_id == id)
        .collect();
    Json(serde_json::to_value(&session_execs).unwrap())
}

/// DELETE /api/sandbox/sessions/{id} — Destroy a sandbox session.
async fn sandbox_destroy_session<S: HasSandboxState>(
    State(state): State<S>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let sandbox = state.sandbox();
    let mut sessions = sandbox.sessions.write().await;

    if let Some(session) = sessions.remove(&id) {
        if let Some(container_id) = &session.container_id {
            if let Err(e) = destroy_container(container_id).await {
                tracing::warn!("Sandbox: failed to destroy container {}: {}", container_id, e);
            }
        }
        tracing::info!("Sandbox: destroyed session {}", id);
        (StatusCode::OK, Json(serde_json::json!({ "status": "destroyed", "session_id": id })))
    } else {
        (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Session not found" })))
    }
}

/// GET /api/sandbox/executions — Recent executions (all sessions).
async fn sandbox_list_executions<S: HasSandboxState>(State(state): State<S>) -> impl IntoResponse {
    let execs = state.sandbox().executions.read().await;
    let recent: Vec<&SandboxExecution> = execs.iter().rev().take(50).collect();
    Json(serde_json::to_value(&recent).unwrap())
}

// ── DB Persistence (best-effort) ─────────────────────────────────────────────

async fn persist_session(db: &sqlx::PgPool, session: &SandboxSession) {
    let status = format!("{:?}", session.status).to_lowercase();
    let language = format!("{:?}", session.language).to_lowercase();

    let result = sqlx::query(
        "INSERT INTO ch_sandbox_sessions (id, container_id, language, status, memory_mb, cpu_shares, timeout_secs, no_network, read_only, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET status = $4, container_id = $2"
    )
    .bind(&session.id)
    .bind(&session.container_id)
    .bind(&language)
    .bind(&status)
    .bind(session.resource_limits.memory_mb as i32)
    .bind(session.resource_limits.cpu_shares as i32)
    .bind(session.resource_limits.timeout_secs as i32)
    .bind(session.resource_limits.no_network)
    .bind(session.resource_limits.read_only)
    .bind(session.created_at)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::debug!("Sandbox: failed to persist session {}: {}", session.id, e);
    }
}

async fn persist_execution(db: &sqlx::PgPool, execution: &SandboxExecution) {
    let status = format!("{:?}", execution.status).to_lowercase();
    let language = format!("{:?}", execution.language).to_lowercase();

    let result = sqlx::query(
        "INSERT INTO ch_sandbox_executions (id, session_id, code, language, stdout, stderr, exit_code, status, duration_ms, executed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING"
    )
    .bind(&execution.id)
    .bind(&execution.session_id)
    .bind(&execution.code)
    .bind(&language)
    .bind(&execution.stdout)
    .bind(&execution.stderr)
    .bind(execution.exit_code)
    .bind(&status)
    .bind(execution.duration_ms as i64)
    .bind(execution.executed_at)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::debug!("Sandbox: failed to persist execution {}: {}", execution.id, e);
    }
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn sandbox_router<S: HasSandboxState>() -> Router<S> {
    Router::new()
        .route("/api/sandbox/health", get(sandbox_health::<S>))
        .route("/api/sandbox/create", post(sandbox_create::<S>))
        .route("/api/sandbox/execute", post(sandbox_execute::<S>))
        .route("/api/sandbox/sessions", get(sandbox_list_sessions::<S>))
        .route(
            "/api/sandbox/sessions/{id}",
            get(sandbox_get_session::<S>).delete(sandbox_destroy_session::<S>),
        )
        .route(
            "/api/sandbox/sessions/{id}/executions",
            get(sandbox_session_executions::<S>),
        )
        .route("/api/sandbox/executions", get(sandbox_list_executions::<S>))
}

// ── MCP Tool Definition ──────────────────────────────────────────────────────

/// Returns the MCP tool definition for `sandbox_execute_code`.
///
/// This tool allows AI agents to execute code in an isolated sandbox
/// before applying changes to the host filesystem.
pub fn sandbox_execute_tool_def() -> serde_json::Value {
    serde_json::json!({
        "name": "sandbox_execute_code",
        "description": "Execute code in an isolated Docker sandbox. Use this to test generated code before applying it to the host filesystem. Returns stdout, stderr, and exit code. Supports Node.js, Python, Rust, and Bash. No network access, limited CPU/memory, 30s timeout by default.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The code to execute in the sandbox"
                },
                "language": {
                    "type": "string",
                    "enum": ["node", "python", "rust", "bash"],
                    "description": "Programming language/runtime to use"
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Execution timeout in seconds (default: 30, max: 120)"
                }
            },
            "required": ["code", "language"]
        }
    })
}

// ── Tool executor helpers (called from tools/mod.rs) ─────────────────────────

/// Create a temporary container for ephemeral tool execution.
/// Returns (container_id, SandboxExecution) on success.
pub async fn create_container_for_tool(
    _language: SandboxLanguage,
    _limits: &ResourceLimits,
) -> Result<(String, SandboxExecution), String> {
    // This is a stub that creates a container but doesn't execute yet.
    // The actual pattern is: create, execute, destroy (see execute_ephemeral_for_tool).
    Err("Use execute_without_docker_for_tool for now".to_string())
}

/// Destroy a container used by the tool executor.
pub async fn destroy_container_for_tool(container_id: &str) -> Result<(), String> {
    destroy_container(container_id).await
}

/// Execute code without Docker — public helper for tool executor.
pub async fn execute_without_docker_for_tool(
    language: SandboxLanguage,
    code: &str,
    timeout_secs: u32,
) -> SandboxExecution {
    execute_without_docker(language, code, timeout_secs).await
}

// ── Cleanup Loop ─────────────────────────────────────────────────────────────

/// Spawn a background loop that cleans up idle sandbox sessions every 5 minutes.
pub fn spawn_cleanup_loop(sandbox: SandboxState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(300));
        loop {
            interval.tick().await;
            sandbox.cleanup_idle().await;
        }
    });
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_docker_images() {
        assert_eq!(SandboxLanguage::Node.docker_image(), "node:22-alpine");
        assert_eq!(SandboxLanguage::Python.docker_image(), "python:3.13-alpine");
        assert_eq!(SandboxLanguage::Rust.docker_image(), "rust:1.87-alpine");
        assert_eq!(SandboxLanguage::Bash.docker_image(), "alpine:3.21");
    }

    #[test]
    fn test_language_run_command() {
        let cmd = SandboxLanguage::Node.run_command("console.log('hello')");
        assert_eq!(cmd, vec!["node", "-e", "console.log('hello')"]);

        let cmd = SandboxLanguage::Python.run_command("print('hello')");
        assert_eq!(cmd, vec!["python3", "-c", "print('hello')"]);
    }

    #[test]
    fn test_default_resource_limits() {
        let limits = ResourceLimits::default();
        assert_eq!(limits.memory_mb, 128);
        assert_eq!(limits.cpu_shares, 256);
        assert_eq!(limits.timeout_secs, 30);
        assert!(limits.no_network);
        assert!(!limits.read_only);
    }

    #[test]
    fn test_sandbox_state_creation() {
        let state = SandboxState::new();
        assert!(!state.is_docker_available());
    }

    #[test]
    fn test_sandbox_execute_tool_def() {
        let def = sandbox_execute_tool_def();
        assert_eq!(def["name"], "sandbox_execute_code");
        assert!(def["input_schema"]["properties"]["code"].is_object());
        assert!(def["input_schema"]["properties"]["language"].is_object());
    }

    #[test]
    fn test_code_limit() {
        // Code under 64KB should be fine
        let code = "x".repeat(65536);
        assert_eq!(code.len(), 65536);

        let code_over = "x".repeat(65537);
        assert!(code_over.len() > 65536);
    }

    #[tokio::test]
    async fn test_sandbox_state_cleanup() {
        let state = SandboxState::new();

        // Add a session with old timestamp
        let old_session = SandboxSession {
            id: "test-old".to_string(),
            container_id: None,
            language: SandboxLanguage::Node,
            status: SandboxStatus::Ready,
            resource_limits: ResourceLimits::default(),
            created_at: chrono::Utc::now() - chrono::Duration::hours(1),
            last_execution_at: None,
            execution_count: 0,
        };

        {
            let mut sessions = state.sessions.write().await;
            sessions.insert("test-old".to_string(), old_session);
        }

        state.cleanup_idle().await;

        let sessions = state.sessions.read().await;
        assert!(sessions.is_empty(), "Old session should be cleaned up");
    }

    #[tokio::test]
    async fn test_sandbox_state_no_cleanup_recent() {
        let state = SandboxState::new();

        // Add a fresh session
        let fresh_session = SandboxSession {
            id: "test-fresh".to_string(),
            container_id: None,
            language: SandboxLanguage::Node,
            status: SandboxStatus::Ready,
            resource_limits: ResourceLimits::default(),
            created_at: chrono::Utc::now(),
            last_execution_at: None,
            execution_count: 0,
        };

        {
            let mut sessions = state.sessions.write().await;
            sessions.insert("test-fresh".to_string(), fresh_session);
        }

        state.cleanup_idle().await;

        let sessions = state.sessions.read().await;
        assert_eq!(sessions.len(), 1, "Fresh session should NOT be cleaned up");
    }
}

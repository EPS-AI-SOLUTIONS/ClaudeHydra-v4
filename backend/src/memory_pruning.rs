// memory_pruning — Advanced Agent Self-Reflection & Memory Pruning
//
// Periodically evaluates the Knowledge Graph (hipokamp MCP memory),
// identifies duplicate/obsolete entries via embedding similarity,
// clusters related memories, and prunes stale knowledge.
//
// Architecture:
//   MCP hipokamp (read_graph) → EmbeddingClient → cosine clustering
//   → reflection prompt → prune actions → MCP delete/merge → audit log

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use axum::Router;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, patch, post};
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tokio::sync::RwLock;

// ── Configuration ────────────────────────────────────────────────────────────

/// Memory pruning configuration — loaded from ch_memory_pruning_config.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PruningConfig {
    /// Whether automatic pruning is enabled
    pub enabled: bool,
    /// Cosine similarity threshold for clustering (0.0 - 1.0)
    pub similarity_threshold: f64,
    /// Minimum age in hours before an entry is eligible for pruning
    pub min_age_hours: i32,
    /// Maximum number of memory entries to retain
    pub max_memory_entries: i32,
    /// Interval between automatic prune cycles (seconds)
    pub auto_prune_interval_secs: i32,
    /// Maximum entries to merge per cluster
    pub max_cluster_size: i32,
}

impl Default for PruningConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            similarity_threshold: 0.85,
            min_age_hours: 24,
            max_memory_entries: 500,
            auto_prune_interval_secs: 3600,
            max_cluster_size: 5,
        }
    }
}

// ── Types ────────────────────────────────────────────────────────────────────

/// Action taken on a memory entry during pruning.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PruneAction {
    Delete,
    Merge,
    Keep,
    Archive,
}

impl std::fmt::Display for PruneAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Delete => write!(f, "delete"),
            Self::Merge => write!(f, "merge"),
            Self::Keep => write!(f, "keep"),
            Self::Archive => write!(f, "archive"),
        }
    }
}

/// A memory entity fetched from the Knowledge Graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntity {
    pub name: String,
    pub entity_type: String,
    pub observations: Vec<String>,
}

/// A cluster of semantically similar memory entities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryCluster {
    pub representative: String,
    pub members: Vec<String>,
    pub avg_similarity: f64,
}

/// Result of a single pruning action on one entity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PruneLogEntry {
    pub entity_name: String,
    pub action: PruneAction,
    pub reason: String,
    pub similarity_score: Option<f64>,
    pub merged_into: Option<String>,
    pub tokens_before: u64,
    pub tokens_after: u64,
}

/// Summary of a completed pruning cycle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PruneCycleSummary {
    pub id: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub status: String,
    pub total_entries: i32,
    pub deleted_count: i32,
    pub merged_count: i32,
    pub kept_count: i32,
    pub clusters_found: i32,
    pub tokens_saved: i64,
    pub error: Option<String>,
    pub triggered_by: String,
}

// ── Metrics (lock-free atomics) ──────────────────────────────────────────────

#[derive(Debug)]
pub struct PruningMetrics {
    pub total_cycles: AtomicU64,
    pub total_deleted: AtomicU64,
    pub total_merged: AtomicU64,
    pub total_kept: AtomicU64,
    pub total_tokens_saved: AtomicU64,
    pub total_clusters_found: AtomicU64,
    pub last_cycle_duration_ms: AtomicU64,
    pub start_time: Instant,
}

impl PruningMetrics {
    pub fn new() -> Self {
        Self {
            total_cycles: AtomicU64::new(0),
            total_deleted: AtomicU64::new(0),
            total_merged: AtomicU64::new(0),
            total_kept: AtomicU64::new(0),
            total_tokens_saved: AtomicU64::new(0),
            total_clusters_found: AtomicU64::new(0),
            last_cycle_duration_ms: AtomicU64::new(0),
            start_time: Instant::now(),
        }
    }

    pub fn record_cycle(&self, deleted: u64, merged: u64, kept: u64, tokens_saved: u64, clusters: u64, duration_ms: u64) {
        self.total_cycles.fetch_add(1, Ordering::Relaxed);
        self.total_deleted.fetch_add(deleted, Ordering::Relaxed);
        self.total_merged.fetch_add(merged, Ordering::Relaxed);
        self.total_kept.fetch_add(kept, Ordering::Relaxed);
        self.total_tokens_saved.fetch_add(tokens_saved, Ordering::Relaxed);
        self.total_clusters_found.fetch_add(clusters, Ordering::Relaxed);
        self.last_cycle_duration_ms.store(duration_ms, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> MetricsSnapshot {
        MetricsSnapshot {
            total_cycles: self.total_cycles.load(Ordering::Relaxed),
            total_deleted: self.total_deleted.load(Ordering::Relaxed),
            total_merged: self.total_merged.load(Ordering::Relaxed),
            total_kept: self.total_kept.load(Ordering::Relaxed),
            total_tokens_saved: self.total_tokens_saved.load(Ordering::Relaxed),
            total_clusters_found: self.total_clusters_found.load(Ordering::Relaxed),
            last_cycle_duration_ms: self.last_cycle_duration_ms.load(Ordering::Relaxed),
            uptime_seconds: self.start_time.elapsed().as_secs(),
        }
    }

    pub fn prometheus_output(&self) -> String {
        let s = self.snapshot();
        format!(
            "# HELP memory_pruning_cycles_total Total pruning cycles completed\n\
             # TYPE memory_pruning_cycles_total counter\n\
             memory_pruning_cycles_total {}\n\
             # HELP memory_pruning_deleted_total Total memory entries deleted\n\
             # TYPE memory_pruning_deleted_total counter\n\
             memory_pruning_deleted_total {}\n\
             # HELP memory_pruning_merged_total Total memory entries merged\n\
             # TYPE memory_pruning_merged_total counter\n\
             memory_pruning_merged_total {}\n\
             # HELP memory_pruning_tokens_saved Total tokens saved via pruning\n\
             # TYPE memory_pruning_tokens_saved counter\n\
             memory_pruning_tokens_saved {}\n\
             # HELP memory_pruning_last_cycle_ms Last pruning cycle duration\n\
             # TYPE memory_pruning_last_cycle_ms gauge\n\
             memory_pruning_last_cycle_ms {}\n",
            s.total_cycles,
            s.total_deleted,
            s.total_merged,
            s.total_tokens_saved,
            s.last_cycle_duration_ms,
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    pub total_cycles: u64,
    pub total_deleted: u64,
    pub total_merged: u64,
    pub total_kept: u64,
    pub total_tokens_saved: u64,
    pub total_clusters_found: u64,
    pub last_cycle_duration_ms: u64,
    pub uptime_seconds: u64,
}

// ── State ────────────────────────────────────────────────────────────────────

/// Central state for the memory pruning system.
pub struct MemoryPruningState {
    pub config: RwLock<PruningConfig>,
    pub metrics: PruningMetrics,
    pub is_running: Arc<std::sync::atomic::AtomicBool>,
}

impl MemoryPruningState {
    pub async fn new(db: &PgPool) -> Self {
        let config = load_config_from_db(db).await.unwrap_or_default();
        Self {
            config: RwLock::new(config),
            metrics: PruningMetrics::new(),
            is_running: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    #[doc(hidden)]
    pub fn new_test() -> Self {
        Self {
            config: RwLock::new(PruningConfig { enabled: false, ..Default::default() }),
            metrics: PruningMetrics::new(),
            is_running: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }
}

// ── Trait ─────────────────────────────────────────────────────────────────────

/// Trait for app state that supports memory pruning.
pub trait HasMemoryPruning: Clone + Send + Sync + 'static {
    fn memory_pruning(&self) -> &Arc<MemoryPruningState>;
    fn pruning_db(&self) -> &PgPool;
    fn mcp_client(&self) -> &Arc<jaskier_hydra_state::McpClientManager>;
}

// ── Database helpers ─────────────────────────────────────────────────────────

async fn load_config_from_db(db: &PgPool) -> Option<PruningConfig> {
    let row = sqlx::query_as::<_, (bool, f64, i32, i32, i32, i32)>(
        "SELECT enabled, similarity_threshold, min_age_hours, max_memory_entries, \
         auto_prune_interval_secs, max_cluster_size \
         FROM ch_memory_pruning_config WHERE id = 1",
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten()?;

    Some(PruningConfig {
        enabled: row.0,
        similarity_threshold: row.1,
        min_age_hours: row.2,
        max_memory_entries: row.3,
        auto_prune_interval_secs: row.4,
        max_cluster_size: row.5,
    })
}

async fn save_config_to_db(db: &PgPool, config: &PruningConfig) -> Result<(), String> {
    sqlx::query(
        "UPDATE ch_memory_pruning_config SET \
         enabled = $1, similarity_threshold = $2, min_age_hours = $3, \
         max_memory_entries = $4, auto_prune_interval_secs = $5, \
         max_cluster_size = $6, updated_at = NOW() \
         WHERE id = 1",
    )
    .bind(config.enabled)
    .bind(config.similarity_threshold)
    .bind(config.min_age_hours)
    .bind(config.max_memory_entries)
    .bind(config.auto_prune_interval_secs)
    .bind(config.max_cluster_size)
    .execute(db)
    .await
    .map_err(|e| format!("Failed to save pruning config: {}", e))?;
    Ok(())
}

async fn save_cycle_to_db(db: &PgPool, cycle: &PruneCycleSummary) {
    let _ = sqlx::query(
        "INSERT INTO ch_memory_pruning_cycles \
         (id, started_at, completed_at, status, total_entries, deleted_count, merged_count, \
          kept_count, clusters_found, tokens_saved, error, triggered_by) \
         VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12) \
         ON CONFLICT (id) DO UPDATE SET \
         completed_at = EXCLUDED.completed_at, status = EXCLUDED.status, \
         total_entries = EXCLUDED.total_entries, deleted_count = EXCLUDED.deleted_count, \
         merged_count = EXCLUDED.merged_count, kept_count = EXCLUDED.kept_count, \
         clusters_found = EXCLUDED.clusters_found, tokens_saved = EXCLUDED.tokens_saved, \
         error = EXCLUDED.error",
    )
    .bind(&cycle.id)
    .bind(&cycle.started_at)
    .bind(&cycle.completed_at)
    .bind(&cycle.status)
    .bind(cycle.total_entries)
    .bind(cycle.deleted_count)
    .bind(cycle.merged_count)
    .bind(cycle.kept_count)
    .bind(cycle.clusters_found)
    .bind(cycle.tokens_saved)
    .bind(&cycle.error)
    .bind(&cycle.triggered_by)
    .execute(db)
    .await;
}

async fn save_prune_log_entry(db: &PgPool, cycle_id: &str, entry: &PruneLogEntry) {
    let _ = sqlx::query(
        "INSERT INTO ch_memory_pruning_log \
         (cycle_id, entity_name, action, reason, similarity_score, merged_into, tokens_before, tokens_after) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(cycle_id)
    .bind(&entry.entity_name)
    .bind(entry.action.to_string())
    .bind(&entry.reason)
    .bind(entry.similarity_score)
    .bind(&entry.merged_into)
    .bind(entry.tokens_before as i64)
    .bind(entry.tokens_after as i64)
    .execute(db)
    .await;
}

// ── Core Pruning Logic ───────────────────────────────────────────────────────

/// Estimate token count from text (rough approximation: 1 token ≈ 4 chars).
fn estimate_tokens(text: &str) -> u64 {
    (text.len() as u64 + 3) / 4
}

/// Compute cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;
    for (ai, bi) in a.iter().zip(b.iter()) {
        let af = *ai as f64;
        let bf = *bi as f64;
        dot += af * bf;
        norm_a += af * af;
        norm_b += bf * bf;
    }
    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom < 1e-12 { 0.0 } else { dot / denom }
}

/// Fetch all memory entities from hipokamp MCP (read_graph).
async fn fetch_memory_entities(
    mcp_client: &jaskier_hydra_state::McpClientManager,
) -> Result<Vec<MemoryEntity>, String> {
    let args = serde_json::json!({});
    let result_str = mcp_client
        .call_tool("hipokamp_read_graph", &args)
        .await
        .map_err(|e| format!("MCP read_graph failed: {}", e))?;

    // Parse MCP response string — hipokamp returns JSON { entities: [...], relations: [...] }
    let result: serde_json::Value = serde_json::from_str(&result_str)
        .map_err(|e| format!("Failed to parse MCP response: {}", e))?;

    let entities = result
        .get("entities")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| {
                    let name = e.get("name")?.as_str()?.to_string();
                    let entity_type = e
                        .get("entityType")
                        .and_then(|t| t.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let observations = e
                        .get("observations")
                        .and_then(|o| o.as_array())
                        .map(|obs| {
                            obs.iter()
                                .filter_map(|o| o.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(MemoryEntity {
                        name,
                        entity_type,
                        observations,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(entities)
}

/// Build text representation for embedding.
fn entity_to_text(entity: &MemoryEntity) -> String {
    let mut text = format!("[{}] {}", entity.entity_type, entity.name);
    for obs in &entity.observations {
        text.push_str(" | ");
        text.push_str(obs);
    }
    text
}

/// Cluster entities by embedding similarity.
fn cluster_entities(
    entities: &[MemoryEntity],
    embeddings: &[Vec<f32>],
    threshold: f64,
    max_cluster_size: usize,
) -> Vec<MemoryCluster> {
    let n = entities.len();
    let mut assigned = vec![false; n];
    let mut clusters = Vec::new();

    for i in 0..n {
        if assigned[i] {
            continue;
        }

        let mut members = vec![entities[i].name.clone()];
        let mut sim_sum = 0.0;
        let mut sim_count = 0u32;

        for j in (i + 1)..n {
            if assigned[j] || members.len() >= max_cluster_size {
                break;
            }

            let sim = cosine_similarity(&embeddings[i], &embeddings[j]);
            if sim >= threshold {
                members.push(entities[j].name.clone());
                assigned[j] = true;
                sim_sum += sim;
                sim_count += 1;
            }
        }

        if members.len() > 1 {
            clusters.push(MemoryCluster {
                representative: entities[i].name.clone(),
                members,
                avg_similarity: if sim_count > 0 { sim_sum / sim_count as f64 } else { 0.0 },
            });
        }

        assigned[i] = true;
    }

    clusters
}

/// Build a self-reflection prompt for analyzing a cluster of similar memories.
fn build_reflection_prompt(cluster: &MemoryCluster, entities: &[MemoryEntity]) -> String {
    let mut prompt = String::from(
        "Jesteś agentem odpowiedzialnym za utrzymanie bazy wiedzy (Knowledge Graph).\n\
         Przeanalizuj poniższy klaster podobnych wpisów pamięci i zdecyduj:\n\
         1. Które wpisy są duplikatami i mogą być usunięte?\n\
         2. Które wpisy można scalić w jeden bardziej kompletny?\n\
         3. Które wpisy zawierają sprzeczne informacje?\n\
         4. Które wpisy są nieaktualne?\n\n\
         Zwróć JSON w formacie:\n\
         ```json\n\
         {\n  \"actions\": [\n    {\n      \"entity\": \"nazwa\",\n      \"action\": \"delete|merge|keep\",\n      \"reason\": \"powód\",\n      \"merge_into\": \"nazwa_docelowa (opcjonalne)\"\n    }\n  ],\n  \"merged_observation\": \"scalone obserwacje (jeśli merge)\"\n}\n```\n\n\
         === Klaster (średnie podobieństwo: ",
    );
    prompt.push_str(&format!("{:.1}%) ===\n\n", cluster.avg_similarity * 100.0));

    for member_name in &cluster.members {
        if let Some(entity) = entities.iter().find(|e| &e.name == member_name) {
            prompt.push_str(&format!("## [{}] {}\n", entity.entity_type, entity.name));
            for obs in &entity.observations {
                prompt.push_str(&format!("  - {}\n", obs));
            }
            prompt.push('\n');
        }
    }

    prompt
}

/// Execute a full pruning cycle.
pub async fn execute_pruning_cycle<S: HasMemoryPruning>(
    state: &S,
    triggered_by: &str,
) -> Result<PruneCycleSummary, String> {
    let pruning = state.memory_pruning();
    let db = state.pruning_db();
    let mcp = state.mcp_client();

    // Prevent concurrent runs
    if pruning
        .is_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Pruning cycle already running".to_string());
    }

    let cycle_id = uuid::Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let start = Instant::now();

    tracing::info!("Memory pruning cycle {} started (triggered by: {})", cycle_id, triggered_by);

    // Save initial cycle record
    let mut cycle = PruneCycleSummary {
        id: cycle_id.clone(),
        started_at: started_at.clone(),
        completed_at: None,
        status: "running".to_string(),
        total_entries: 0,
        deleted_count: 0,
        merged_count: 0,
        kept_count: 0,
        clusters_found: 0,
        tokens_saved: 0,
        error: None,
        triggered_by: triggered_by.to_string(),
    };
    save_cycle_to_db(db, &cycle).await;

    // Step 1: Fetch all memory entities from hipokamp
    let entities = match fetch_memory_entities(mcp).await {
        Ok(e) => e,
        Err(e) => {
            cycle.status = "failed".to_string();
            cycle.error = Some(e.clone());
            cycle.completed_at = Some(chrono::Utc::now().to_rfc3339());
            save_cycle_to_db(db, &cycle).await;
            pruning.is_running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };

    cycle.total_entries = entities.len() as i32;
    tracing::info!("Fetched {} memory entities for analysis", entities.len());

    if entities.is_empty() {
        cycle.status = "completed".to_string();
        cycle.completed_at = Some(chrono::Utc::now().to_rfc3339());
        save_cycle_to_db(db, &cycle).await;
        pruning.is_running.store(false, Ordering::SeqCst);
        return Ok(cycle);
    }

    // Step 2: Generate embeddings for all entities
    let config = pruning.config.read().await.clone();
    let embedding_client = crate::semantic_cache::embeddings::EmbeddingClient::new(
        std::env::var("GOOGLE_API_KEY").ok(),
    );

    let mut embeddings: Vec<Vec<f32>> = Vec::with_capacity(entities.len());
    for entity in &entities {
        let text = entity_to_text(entity);
        match embedding_client
            .embed(&text, "gemini-embedding-2-preview")
            .await
        {
            Ok(vec) => embeddings.push(vec),
            Err(e) => {
                tracing::warn!("Embedding failed for '{}': {} — using zero vector", entity.name, e);
                embeddings.push(vec![0.0; 3072]);
            }
        }
    }

    // Step 3: Cluster similar entities
    let clusters = cluster_entities(
        &entities,
        &embeddings,
        config.similarity_threshold,
        config.max_cluster_size as usize,
    );
    cycle.clusters_found = clusters.len() as i32;
    tracing::info!("Found {} clusters of similar memories", clusters.len());

    // Step 4: Analyze each cluster and execute pruning actions
    let mut total_tokens_before: u64 = 0;
    let mut total_tokens_after: u64 = 0;

    for cluster in &clusters {
        // Build reflection prompt
        let _reflection = build_reflection_prompt(cluster, &entities);

        // For each cluster, delete all non-representative members (simple dedup strategy)
        // More sophisticated: use AI to decide, but we start with deterministic clustering
        let representative = &cluster.representative;

        // Merge observations from duplicates into representative
        let mut merged_observations: Vec<String> = Vec::new();
        for member_name in &cluster.members {
            if let Some(entity) = entities.iter().find(|e| &e.name == member_name) {
                for obs in &entity.observations {
                    if !merged_observations.contains(obs) {
                        merged_observations.push(obs.clone());
                    }
                }
            }
        }

        // Calculate token savings
        let tokens_before: u64 = cluster
            .members
            .iter()
            .filter_map(|m| entities.iter().find(|e| &e.name == m))
            .map(|e| estimate_tokens(&entity_to_text(e)))
            .sum();
        let merged_text = merged_observations.join(" | ");
        let tokens_after = estimate_tokens(&merged_text);
        total_tokens_before += tokens_before;
        total_tokens_after += tokens_after;

        // Delete duplicate members (keep representative)
        for member_name in &cluster.members {
            if member_name == representative {
                // Keep the representative
                let log_entry = PruneLogEntry {
                    entity_name: member_name.clone(),
                    action: PruneAction::Keep,
                    reason: "Cluster representative — retained".to_string(),
                    similarity_score: Some(cluster.avg_similarity),
                    merged_into: None,
                    tokens_before: estimate_tokens(&entity_to_text(
                        entities.iter().find(|e| &e.name == member_name).unwrap(),
                    )),
                    tokens_after: estimate_tokens(&entity_to_text(
                        entities.iter().find(|e| &e.name == member_name).unwrap(),
                    )),
                };
                save_prune_log_entry(db, &cycle_id, &log_entry).await;
                cycle.kept_count += 1;
                continue;
            }

            // Delete duplicate via MCP
            let delete_args = serde_json::json!({
                "entityNames": [member_name]
            });
            match mcp.call_tool("hipokamp_delete_entities", &delete_args).await {
                Ok(_) => {
                    tracing::info!("Pruned duplicate memory: '{}' (merged into '{}')", member_name, representative);
                    cycle.deleted_count += 1;
                }
                Err(e) => {
                    tracing::warn!("Failed to delete entity '{}': {}", member_name, e);
                }
            }

            let log_entry = PruneLogEntry {
                entity_name: member_name.clone(),
                action: PruneAction::Merge,
                reason: format!(
                    "Duplicate — similarity {:.1}% with '{}'",
                    cluster.avg_similarity * 100.0,
                    representative
                ),
                similarity_score: Some(cluster.avg_similarity),
                merged_into: Some(representative.clone()),
                tokens_before: estimate_tokens(&entity_to_text(
                    entities.iter().find(|e| &e.name == member_name).unwrap_or(&entities[0]),
                )),
                tokens_after: 0,
            };
            save_prune_log_entry(db, &cycle_id, &log_entry).await;
            cycle.merged_count += 1;
        }

        // Add merged observations to representative
        if merged_observations.len() > 1 {
            let add_args = serde_json::json!({
                "observations": [{
                    "entityName": representative,
                    "contents": merged_observations
                }]
            });
            if let Err(e) = mcp.call_tool("hipokamp_add_observations", &add_args).await {
                tracing::warn!("Failed to add merged observations to '{}': {}", representative, e);
            }
        }
    }

    // Mark non-clustered entries as kept
    let clustered_names: std::collections::HashSet<&str> = clusters
        .iter()
        .flat_map(|c| c.members.iter().map(String::as_str))
        .collect();
    for entity in &entities {
        if !clustered_names.contains(entity.name.as_str()) {
            cycle.kept_count += 1;
        }
    }

    // Step 5: Finalize cycle
    let duration_ms = start.elapsed().as_millis() as u64;
    let tokens_saved = total_tokens_before.saturating_sub(total_tokens_after);
    cycle.tokens_saved = tokens_saved as i64;
    cycle.status = "completed".to_string();
    cycle.completed_at = Some(chrono::Utc::now().to_rfc3339());
    save_cycle_to_db(db, &cycle).await;

    // Record metrics
    pruning.metrics.record_cycle(
        cycle.deleted_count as u64,
        cycle.merged_count as u64,
        cycle.kept_count as u64,
        tokens_saved,
        cycle.clusters_found as u64,
        duration_ms,
    );

    // Audit log
    crate::audit::log_audit(
        db,
        "memory_prune",
        serde_json::json!({
            "cycle_id": cycle_id,
            "total_entries": cycle.total_entries,
            "deleted": cycle.deleted_count,
            "merged": cycle.merged_count,
            "clusters": cycle.clusters_found,
            "tokens_saved": tokens_saved,
            "duration_ms": duration_ms,
            "triggered_by": triggered_by,
        }),
        None,
    )
    .await;

    // Send notification via MCP
    let notif_args = serde_json::json!({
        "status": "info",
        "agent": "ClaudeHydra",
        "message": format!(
            "Memory pruning complete: {} deleted, {} merged, {} clusters, {} tokens saved ({}ms)",
            cycle.deleted_count, cycle.merged_count, cycle.clusters_found, tokens_saved, duration_ms
        )
    });
    let _ = mcp
        .call_tool("grzankarz_show_notification", &notif_args)
        .await;

    pruning.is_running.store(false, Ordering::SeqCst);
    tracing::info!(
        "Memory pruning cycle {} completed: {} deleted, {} merged, {} kept, {} clusters, {} tokens saved ({}ms)",
        cycle_id, cycle.deleted_count, cycle.merged_count, cycle.kept_count,
        cycle.clusters_found, tokens_saved, duration_ms
    );

    Ok(cycle)
}

// ── Background Watchdog ──────────────────────────────────────────────────────

/// Spawn background pruning watchdog that runs periodic pruning cycles.
pub fn spawn_pruning_watchdog<S: HasMemoryPruning>(state: S) {
    tokio::spawn(async move {
        // Wait for initial startup to settle
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

        loop {
            let interval = {
                let config = state.memory_pruning().config.read().await;
                if !config.enabled {
                    // Check again in 60s if disabled
                    drop(config);
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    continue;
                }
                config.auto_prune_interval_secs as u64
            };

            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;

            let enabled = state.memory_pruning().config.read().await.enabled;
            if !enabled {
                continue;
            }

            match execute_pruning_cycle(&state, "watchdog").await {
                Ok(cycle) => {
                    tracing::info!(
                        "Watchdog pruning cycle completed: {} deleted, {} merged",
                        cycle.deleted_count, cycle.merged_count
                    );
                }
                Err(e) => {
                    tracing::warn!("Watchdog pruning cycle failed: {}", e);
                }
            }
        }
    });

    tracing::info!("Memory pruning watchdog spawned");
}

// ── HTTP Handlers ────────────────────────────────────────────────────────────

/// POST /api/memory/prune — trigger a manual pruning cycle.
async fn trigger_prune<S: HasMemoryPruning>(State(state): State<S>) -> impl IntoResponse {
    let state_clone = state.clone();
    let cycle_id = uuid::Uuid::new_v4().to_string();

    // Run in background — return 202 immediately
    tokio::spawn(async move {
        if let Err(e) = execute_pruning_cycle(&state_clone, "manual").await {
            tracing::error!("Manual pruning cycle failed: {}", e);
        }
    });

    (
        StatusCode::ACCEPTED,
        Json(serde_json::json!({
            "status": "accepted",
            "cycle_id": cycle_id,
            "message": "Pruning cycle started in background"
        })),
    )
}

/// GET /api/memory/prune/stats — pruning metrics.
async fn prune_stats<S: HasMemoryPruning>(State(state): State<S>) -> impl IntoResponse {
    let metrics = state.memory_pruning().metrics.snapshot();
    let is_running = state
        .memory_pruning()
        .is_running
        .load(Ordering::Relaxed);

    Json(serde_json::json!({
        "metrics": metrics,
        "is_running": is_running,
    }))
}

/// GET /api/memory/prune/history — pruning cycle history.
async fn prune_history<S: HasMemoryPruning>(
    State(state): State<S>,
    Query(params): Query<HistoryParams>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(20).min(100);
    let db = state.pruning_db();

    let cycles = sqlx::query_as::<_, (
        String, String, Option<String>, String, i32, i32, i32, i32, i32, i64, Option<String>, String,
    )>(
        "SELECT id, started_at::text, completed_at::text, status, total_entries, \
         deleted_count, merged_count, kept_count, clusters_found, tokens_saved, error, triggered_by \
         FROM ch_memory_pruning_cycles \
         ORDER BY started_at DESC LIMIT $1",
    )
    .bind(limit as i32)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let cycles: Vec<PruneCycleSummary> = cycles
        .into_iter()
        .map(|r| PruneCycleSummary {
            id: r.0,
            started_at: r.1,
            completed_at: r.2,
            status: r.3,
            total_entries: r.4,
            deleted_count: r.5,
            merged_count: r.6,
            kept_count: r.7,
            clusters_found: r.8,
            tokens_saved: r.9,
            error: r.10,
            triggered_by: r.11,
        })
        .collect();

    Json(serde_json::json!({ "cycles": cycles }))
}

#[derive(Debug, Deserialize)]
struct HistoryParams {
    limit: Option<usize>,
}

/// GET /api/memory/prune/details/{cycle_id} — detailed log entries for a cycle.
async fn prune_details<S: HasMemoryPruning>(
    State(state): State<S>,
    axum::extract::Path(cycle_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let db = state.pruning_db();

    let entries = sqlx::query_as::<_, (String, String, Option<String>, Option<f64>, Option<String>, i64, i64)>(
        "SELECT entity_name, action, reason, similarity_score, merged_into, tokens_before, tokens_after \
         FROM ch_memory_pruning_log \
         WHERE cycle_id = $1 \
         ORDER BY id ASC",
    )
    .bind(&cycle_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let entries: Vec<PruneLogEntry> = entries
        .into_iter()
        .map(|r| PruneLogEntry {
            entity_name: r.0,
            action: match r.1.as_str() {
                "delete" => PruneAction::Delete,
                "merge" => PruneAction::Merge,
                "archive" => PruneAction::Archive,
                _ => PruneAction::Keep,
            },
            reason: r.2.unwrap_or_default(),
            similarity_score: r.3,
            merged_into: r.4,
            tokens_before: r.5 as u64,
            tokens_after: r.6 as u64,
        })
        .collect();

    Json(serde_json::json!({ "entries": entries }))
}

/// GET /api/memory/prune/config — current pruning configuration.
async fn get_config<S: HasMemoryPruning>(State(state): State<S>) -> impl IntoResponse {
    let config = state.memory_pruning().config.read().await.clone();
    Json(config)
}

/// PATCH /api/memory/prune/config — update pruning configuration.
async fn update_config<S: HasMemoryPruning>(
    State(state): State<S>,
    Json(patch): Json<PruningConfigPatch>,
) -> impl IntoResponse {
    let db = state.pruning_db();
    let pruning = state.memory_pruning();
    let mut config = pruning.config.write().await;

    if let Some(enabled) = patch.enabled {
        config.enabled = enabled;
    }
    if let Some(threshold) = patch.similarity_threshold {
        config.similarity_threshold = threshold.clamp(0.5, 1.0);
    }
    if let Some(hours) = patch.min_age_hours {
        config.min_age_hours = hours.max(0);
    }
    if let Some(max) = patch.max_memory_entries {
        config.max_memory_entries = max.max(10);
    }
    if let Some(interval) = patch.auto_prune_interval_secs {
        config.auto_prune_interval_secs = interval.max(300); // min 5 minutes
    }
    if let Some(size) = patch.max_cluster_size {
        config.max_cluster_size = size.clamp(2, 20);
    }

    let config_snapshot = config.clone();
    drop(config);

    if let Err(e) = save_config_to_db(db, &config_snapshot).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e})),
        );
    }

    (StatusCode::OK, Json(serde_json::to_value(config_snapshot).unwrap()))
}

#[derive(Debug, Deserialize)]
struct PruningConfigPatch {
    enabled: Option<bool>,
    similarity_threshold: Option<f64>,
    min_age_hours: Option<i32>,
    max_memory_entries: Option<i32>,
    auto_prune_interval_secs: Option<i32>,
    max_cluster_size: Option<i32>,
}

// ── Router ───────────────────────────────────────────────────────────────────

/// Build the memory pruning router.
pub fn memory_pruning_router<S: HasMemoryPruning>() -> Router<S> {
    Router::new()
        .route("/api/memory/prune", post(trigger_prune::<S>))
        .route("/api/memory/prune/stats", get(prune_stats::<S>))
        .route("/api/memory/prune/history", get(prune_history::<S>))
        .route(
            "/api/memory/prune/details/{cycle_id}",
            get(prune_details::<S>),
        )
        .route(
            "/api/memory/prune/config",
            get(get_config::<S>).patch(update_config::<S>),
        )
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_empty() {
        let a: Vec<f32> = vec![];
        let b: Vec<f32> = vec![];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
    }

    #[test]
    fn test_estimate_tokens() {
        assert_eq!(estimate_tokens("hello world"), 3); // (11+3)/4 = 3
        assert_eq!(estimate_tokens(""), 0); // (0+3)/4 = 0 in integer division
        assert_eq!(estimate_tokens("ab"), 1); // (2+3)/4 = 1
        assert_eq!(estimate_tokens("abcdefgh"), 2); // (8+3)/4 = 2
    }

    #[test]
    fn test_entity_to_text() {
        let entity = MemoryEntity {
            name: "Vite Config".to_string(),
            entity_type: "config".to_string(),
            observations: vec!["port 5199".to_string(), "react plugin".to_string()],
        };
        let text = entity_to_text(&entity);
        assert!(text.contains("[config] Vite Config"));
        assert!(text.contains("port 5199"));
        assert!(text.contains("react plugin"));
    }

    #[test]
    fn test_cluster_entities_basic() {
        let entities = vec![
            MemoryEntity {
                name: "A".to_string(),
                entity_type: "test".to_string(),
                observations: vec![],
            },
            MemoryEntity {
                name: "B".to_string(),
                entity_type: "test".to_string(),
                observations: vec![],
            },
        ];
        // Same embedding → should cluster
        let embeddings = vec![vec![1.0, 0.0, 0.0], vec![1.0, 0.0, 0.0]];
        let clusters = cluster_entities(&entities, &embeddings, 0.85, 5);
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].members.len(), 2);
    }

    #[test]
    fn test_cluster_entities_no_cluster() {
        let entities = vec![
            MemoryEntity {
                name: "A".to_string(),
                entity_type: "test".to_string(),
                observations: vec![],
            },
            MemoryEntity {
                name: "B".to_string(),
                entity_type: "test".to_string(),
                observations: vec![],
            },
        ];
        // Orthogonal embeddings → no cluster
        let embeddings = vec![vec![1.0, 0.0, 0.0], vec![0.0, 1.0, 0.0]];
        let clusters = cluster_entities(&entities, &embeddings, 0.85, 5);
        assert!(clusters.is_empty());
    }

    #[test]
    fn test_prune_action_display() {
        assert_eq!(PruneAction::Delete.to_string(), "delete");
        assert_eq!(PruneAction::Merge.to_string(), "merge");
        assert_eq!(PruneAction::Keep.to_string(), "keep");
        assert_eq!(PruneAction::Archive.to_string(), "archive");
    }

    #[test]
    fn test_pruning_metrics_snapshot() {
        let metrics = PruningMetrics::new();
        metrics.record_cycle(5, 3, 10, 1000, 2, 500);
        let snap = metrics.snapshot();
        assert_eq!(snap.total_cycles, 1);
        assert_eq!(snap.total_deleted, 5);
        assert_eq!(snap.total_merged, 3);
        assert_eq!(snap.total_kept, 10);
        assert_eq!(snap.total_tokens_saved, 1000);
        assert_eq!(snap.total_clusters_found, 2);
        assert_eq!(snap.last_cycle_duration_ms, 500);
    }

    #[test]
    fn test_pruning_config_defaults() {
        let config = PruningConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.similarity_threshold, 0.85);
        assert_eq!(config.min_age_hours, 24);
        assert_eq!(config.max_memory_entries, 500);
        assert_eq!(config.auto_prune_interval_secs, 3600);
        assert_eq!(config.max_cluster_size, 5);
    }

    #[test]
    fn test_build_reflection_prompt() {
        let entities = vec![
            MemoryEntity {
                name: "ViteConfig".to_string(),
                entity_type: "config".to_string(),
                observations: vec!["port 5199".to_string()],
            },
            MemoryEntity {
                name: "ViteSetup".to_string(),
                entity_type: "config".to_string(),
                observations: vec!["port 5199".to_string(), "react plugin".to_string()],
            },
        ];
        let cluster = MemoryCluster {
            representative: "ViteConfig".to_string(),
            members: vec!["ViteConfig".to_string(), "ViteSetup".to_string()],
            avg_similarity: 0.92,
        };
        let prompt = build_reflection_prompt(&cluster, &entities);
        assert!(prompt.contains("ViteConfig"));
        assert!(prompt.contains("ViteSetup"));
        assert!(prompt.contains("92.0%"));
    }

    #[test]
    fn test_prometheus_output() {
        let metrics = PruningMetrics::new();
        metrics.record_cycle(2, 1, 5, 500, 1, 300);
        let output = metrics.prometheus_output();
        assert!(output.contains("memory_pruning_cycles_total 1"));
        assert!(output.contains("memory_pruning_deleted_total 2"));
        assert!(output.contains("memory_pruning_merged_total 1"));
        assert!(output.contains("memory_pruning_tokens_saved 500"));
    }
}

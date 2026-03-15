// semantic_cache — Semantic Router & Context Compression (Enterprise)
//
// Intercepts AI queries, checks Qdrant for >95% cosine similarity cache hits.
// Partial matches (85-95%) are injected as few-shot examples into the prompt.
// AST-aware context compression strips function bodies before prompt injection.
//
// Architecture:
//   EmbeddingClient (Gemini) → QdrantClient (port 6333) → CacheCheckResult
//   Compressor (Tree-Sitter) → stripped signatures for token reduction

pub mod compressor;
pub mod embeddings;
pub mod handlers;
pub mod qdrant;

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use self::embeddings::EmbeddingClient;
use self::qdrant::QdrantClient;

// ── Configuration ────────────────────────────────────────────────────────────

/// Semantic cache configuration — thresholds, TTL, collection settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticCacheConfig {
    /// Qdrant REST API URL (default: http://localhost:6333)
    pub qdrant_url: String,
    /// Qdrant collection name for cache entries
    pub collection_name: String,
    /// Embedding model ID (Gemini)
    pub embedding_model: String,
    /// Vector dimensionality (3072 for gemini-embedding-2-preview)
    pub vector_size: usize,
    /// Cosine similarity threshold for exact cache hit (0.0 - 1.0)
    pub exact_hit_threshold: f64,
    /// Cosine similarity threshold for partial/few-shot hit (0.0 - 1.0)
    pub partial_hit_threshold: f64,
    /// Cache entry TTL in seconds (default: 86400 = 24h)
    pub ttl_seconds: u64,
    /// Whether the cache is enabled
    pub enabled: bool,
    /// Max entries to store (prevents unbounded growth)
    pub max_entries: u64,
    /// Estimated cost per 1M input tokens (USD) — for savings calculation
    pub cost_per_million_input_tokens: f64,
    /// Estimated cost per 1M output tokens (USD) — for savings calculation
    pub cost_per_million_output_tokens: f64,
}

impl Default for SemanticCacheConfig {
    fn default() -> Self {
        Self {
            qdrant_url: std::env::var("QDRANT_URL")
                .unwrap_or_else(|_| "http://localhost:6333".to_string()),
            collection_name: "semantic_cache".to_string(),
            embedding_model: "gemini-embedding-2-preview".to_string(),
            vector_size: 3072,
            exact_hit_threshold: 0.95,
            partial_hit_threshold: 0.85,
            ttl_seconds: 86400, // 24h
            enabled: true,
            max_entries: 10_000,
            cost_per_million_input_tokens: 3.0,  // Claude Sonnet pricing
            cost_per_million_output_tokens: 15.0, // Claude Sonnet pricing
        }
    }
}

// ── Cache Metrics (lock-free atomics) ────────────────────────────────────────

/// Real-time cache performance metrics using atomic counters.
#[derive(Debug)]
pub struct CacheMetrics {
    pub total_queries: AtomicU64,
    pub exact_hits: AtomicU64,
    pub partial_hits: AtomicU64,
    pub misses: AtomicU64,
    pub tokens_saved: AtomicU64,
    pub estimated_cost_saved_microcents: AtomicU64,
    pub avg_search_latency_us: AtomicU64,
    pub start_time: Instant,
}

impl CacheMetrics {
    pub fn new() -> Self {
        Self {
            total_queries: AtomicU64::new(0),
            exact_hits: AtomicU64::new(0),
            partial_hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
            tokens_saved: AtomicU64::new(0),
            estimated_cost_saved_microcents: AtomicU64::new(0),
            avg_search_latency_us: AtomicU64::new(0),
            start_time: Instant::now(),
        }
    }

    pub fn record_exact_hit(&self, tokens: u64, cost_microcents: u64) {
        self.total_queries.fetch_add(1, Ordering::Relaxed);
        self.exact_hits.fetch_add(1, Ordering::Relaxed);
        self.tokens_saved.fetch_add(tokens, Ordering::Relaxed);
        self.estimated_cost_saved_microcents.fetch_add(cost_microcents, Ordering::Relaxed);
    }

    pub fn record_partial_hit(&self) {
        self.total_queries.fetch_add(1, Ordering::Relaxed);
        self.partial_hits.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_miss(&self) {
        self.total_queries.fetch_add(1, Ordering::Relaxed);
        self.misses.fetch_add(1, Ordering::Relaxed);
    }

    pub fn update_avg_latency(&self, latency_us: u64) {
        // Exponential moving average (approximation using atomics)
        let current = self.avg_search_latency_us.load(Ordering::Relaxed);
        let new_avg = if current == 0 {
            latency_us
        } else {
            (current * 7 + latency_us) / 8 // EMA with alpha ≈ 0.125
        };
        self.avg_search_latency_us.store(new_avg, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> MetricsSnapshot {
        let total = self.total_queries.load(Ordering::Relaxed);
        let exact = self.exact_hits.load(Ordering::Relaxed);
        let partial = self.partial_hits.load(Ordering::Relaxed);
        let misses = self.misses.load(Ordering::Relaxed);

        MetricsSnapshot {
            total_queries: total,
            exact_hits: exact,
            partial_hits: partial,
            misses,
            hit_rate: if total > 0 { (exact + partial) as f64 / total as f64 } else { 0.0 },
            exact_hit_rate: if total > 0 { exact as f64 / total as f64 } else { 0.0 },
            tokens_saved: self.tokens_saved.load(Ordering::Relaxed),
            estimated_cost_saved_usd: self.estimated_cost_saved_microcents.load(Ordering::Relaxed) as f64 / 100_000_000.0,
            avg_search_latency_ms: self.avg_search_latency_us.load(Ordering::Relaxed) as f64 / 1000.0,
            uptime_seconds: self.start_time.elapsed().as_secs(),
        }
    }

    /// Prometheus-format metrics output.
    pub fn prometheus_output(&self) -> String {
        let s = self.snapshot();
        format!(
            "# HELP semantic_cache_queries_total Total semantic cache queries\n\
             # TYPE semantic_cache_queries_total counter\n\
             semantic_cache_queries_total {}\n\
             # HELP semantic_cache_hits_total Cache hits by type\n\
             # TYPE semantic_cache_hits_total counter\n\
             semantic_cache_hits_total{{type=\"exact\"}} {}\n\
             semantic_cache_hits_total{{type=\"partial\"}} {}\n\
             # HELP semantic_cache_misses_total Cache misses\n\
             # TYPE semantic_cache_misses_total counter\n\
             semantic_cache_misses_total {}\n\
             # HELP semantic_cache_hit_rate Cache hit rate (0-1)\n\
             # TYPE semantic_cache_hit_rate gauge\n\
             semantic_cache_hit_rate {:.4}\n\
             # HELP semantic_cache_tokens_saved Total tokens saved via cache\n\
             # TYPE semantic_cache_tokens_saved counter\n\
             semantic_cache_tokens_saved {}\n\
             # HELP semantic_cache_cost_saved_usd Estimated USD saved\n\
             # TYPE semantic_cache_cost_saved_usd counter\n\
             semantic_cache_cost_saved_usd {:.6}\n\
             # HELP semantic_cache_search_latency_ms Average search latency\n\
             # TYPE semantic_cache_search_latency_ms gauge\n\
             semantic_cache_search_latency_ms {:.2}\n",
            s.total_queries,
            s.exact_hits,
            s.partial_hits,
            s.misses,
            s.hit_rate,
            s.tokens_saved,
            s.estimated_cost_saved_usd,
            s.avg_search_latency_ms,
        )
    }
}

/// Serializable metrics snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    pub total_queries: u64,
    pub exact_hits: u64,
    pub partial_hits: u64,
    pub misses: u64,
    pub hit_rate: f64,
    pub exact_hit_rate: f64,
    pub tokens_saved: u64,
    pub estimated_cost_saved_usd: f64,
    pub avg_search_latency_ms: f64,
    pub uptime_seconds: u64,
}

// ── Cache Check Result ───────────────────────────────────────────────────────

/// Result of checking the semantic cache for a query.
#[derive(Debug, Clone)]
pub enum CacheCheckResult {
    /// Exact hit (>= exact_hit_threshold). Response can be returned directly.
    ExactHit {
        cached_response: String,
        similarity: f64,
        point_id: String,
        tokens_saved: u64,
    },
    /// Partial hit (>= partial_hit_threshold, < exact_hit_threshold).
    /// The cached response should be injected as a few-shot example.
    PartialHit {
        example_query: String,
        example_response: String,
        similarity: f64,
    },
    /// No relevant cache entry found.
    Miss,
}

// ── Semantic Cache State ─────────────────────────────────────────────────────

/// Central state for the semantic cache system.
pub struct SemanticCacheState {
    pub config: RwLock<SemanticCacheConfig>,
    pub qdrant: QdrantClient,
    pub embeddings: EmbeddingClient,
    pub metrics: CacheMetrics,
}

impl SemanticCacheState {
    pub async fn new(google_api_key: Option<String>) -> Self {
        let config = SemanticCacheConfig::default();
        let qdrant = QdrantClient::new(&config.qdrant_url);
        let embeddings = EmbeddingClient::new(google_api_key);

        // Try to ensure collection exists at startup
        if let Err(e) = qdrant
            .ensure_collection(&config.collection_name, config.vector_size)
            .await
        {
            tracing::warn!("Failed to ensure Qdrant collection: {} (cache will retry on first use)", e);
        } else {
            tracing::info!(
                "Semantic cache initialized: collection={}, vector_size={}, thresholds=[{}, {}]",
                config.collection_name,
                config.vector_size,
                config.exact_hit_threshold,
                config.partial_hit_threshold,
            );
        }

        Self {
            config: RwLock::new(config),
            qdrant,
            embeddings,
            metrics: CacheMetrics::new(),
        }
    }

    /// Test-only sync constructor — no Qdrant connection attempted.
    #[doc(hidden)]
    pub fn new_test() -> Self {
        let config = SemanticCacheConfig {
            enabled: false,
            qdrant_url: "http://localhost:19999".to_string(),
            ..Default::default()
        };
        Self {
            qdrant: QdrantClient::new(&config.qdrant_url),
            embeddings: EmbeddingClient::new(None),
            config: RwLock::new(config),
            metrics: CacheMetrics::new(),
        }
    }

    /// Check the cache for a similar query.
    pub async fn check(&self, query: &str) -> CacheCheckResult {
        let config = self.config.read().await;
        if !config.enabled {
            return CacheCheckResult::Miss;
        }

        let start = Instant::now();

        // 1. Generate embedding for the query
        let embedding = match self.embeddings.embed(query, &config.embedding_model).await {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("Embedding generation failed: {}", e);
                self.metrics.record_miss();
                return CacheCheckResult::Miss;
            }
        };

        // 2. Search Qdrant for similar cached queries
        let results = match self
            .qdrant
            .search(
                &config.collection_name,
                &embedding,
                config.partial_hit_threshold,
                3, // top 3 results
            )
            .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Qdrant search failed: {}", e);
                self.metrics.record_miss();
                return CacheCheckResult::Miss;
            }
        };

        let elapsed_us = start.elapsed().as_micros() as u64;
        self.metrics.update_avg_latency(elapsed_us);

        // 3. Evaluate results
        if let Some(best) = results.first() {
            let similarity = best.score;

            if similarity >= config.exact_hit_threshold {
                // Exact cache hit
                let cached_response = best
                    .payload
                    .get("response")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let tokens = best
                    .payload
                    .get("token_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let point_id = best.id.clone();

                // Calculate cost savings (rough estimate)
                let input_cost = (query.len() as f64 / 4.0) * config.cost_per_million_input_tokens / 1_000_000.0;
                let output_cost = tokens as f64 * config.cost_per_million_output_tokens / 1_000_000.0;
                let savings_microcents = ((input_cost + output_cost) * 100_000_000.0) as u64;

                self.metrics.record_exact_hit(tokens, savings_microcents);

                // Update hit count in Qdrant (fire and forget)
                let hit_count = best
                    .payload
                    .get("hit_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
                    + 1;
                let qdrant = self.qdrant.clone();
                let collection = config.collection_name.clone();
                let pid = point_id.clone();
                tokio::spawn(async move {
                    let _ = qdrant
                        .update_payload(
                            &collection,
                            &pid,
                            serde_json::json!({ "hit_count": hit_count }),
                        )
                        .await;
                });

                tracing::info!(
                    "Semantic cache EXACT HIT: similarity={:.4}, tokens_saved={}, query_prefix={}",
                    similarity,
                    tokens,
                    &query[..query.len().min(80)],
                );

                return CacheCheckResult::ExactHit {
                    cached_response,
                    similarity,
                    point_id,
                    tokens_saved: tokens,
                };
            }

            if similarity >= config.partial_hit_threshold {
                // Partial hit — inject as few-shot example
                let example_query = best
                    .payload
                    .get("query")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let example_response = best
                    .payload
                    .get("response")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                self.metrics.record_partial_hit();

                tracing::info!(
                    "Semantic cache PARTIAL HIT: similarity={:.4}, injecting few-shot example",
                    similarity,
                );

                return CacheCheckResult::PartialHit {
                    example_query,
                    example_response,
                    similarity,
                };
            }
        }

        self.metrics.record_miss();
        CacheCheckResult::Miss
    }

    /// Store a query-response pair in the cache.
    pub async fn store(
        &self,
        query: &str,
        response: &str,
        model: &str,
        provider: &str,
    ) -> Result<(), String> {
        let config = self.config.read().await;
        if !config.enabled {
            return Ok(());
        }

        // Generate embedding
        let embedding = self
            .embeddings
            .embed(query, &config.embedding_model)
            .await?;

        // Estimate token count (rough: 1 token ≈ 4 chars)
        let token_count = response.len() as u64 / 4;

        // Get current git commit (for invalidation)
        let git_commit = get_current_git_commit().await;

        let now = chrono::Utc::now();
        let ttl_expires = now + chrono::Duration::seconds(config.ttl_seconds as i64);

        let point_id = uuid::Uuid::new_v4().to_string();
        let payload = serde_json::json!({
            "query": query,
            "response": response,
            "model": model,
            "provider": provider,
            "token_count": token_count,
            "hit_count": 0,
            "git_commit_hash": git_commit,
            "created_at": now.to_rfc3339(),
            "ttl_expires_at": ttl_expires.to_rfc3339(),
        });

        self.qdrant
            .upsert(&config.collection_name, &point_id, &embedding, payload)
            .await?;

        tracing::debug!(
            "Cached response: model={}, tokens={}, ttl_expires={}",
            model,
            token_count,
            ttl_expires.to_rfc3339(),
        );

        Ok(())
    }

    /// Invalidate all cache entries created before a specific git commit.
    pub async fn invalidate_by_commit(&self, commit_hash: &str) -> Result<u64, String> {
        let config = self.config.read().await;
        self.qdrant
            .delete_by_filter(
                &config.collection_name,
                serde_json::json!({
                    "must_not": [{
                        "key": "git_commit_hash",
                        "match": { "value": commit_hash }
                    }]
                }),
            )
            .await
    }

    /// Remove expired cache entries (TTL cleanup).
    pub async fn cleanup_expired(&self) -> Result<u64, String> {
        let config = self.config.read().await;
        let now = chrono::Utc::now().to_rfc3339();
        self.qdrant
            .delete_by_filter(
                &config.collection_name,
                serde_json::json!({
                    "must": [{
                        "key": "ttl_expires_at",
                        "range": { "lt": now }
                    }]
                }),
            )
            .await
    }

    /// Inject a few-shot example into the messages array for partial cache hits.
    pub fn inject_few_shot(
        messages: &mut Vec<serde_json::Value>,
        example_query: &str,
        example_response: &str,
        similarity: f64,
    ) {
        // Insert the few-shot example before the last user message
        let injection = vec![
            serde_json::json!({
                "role": "user",
                "content": format!(
                    "[Historyczny przykład rozwiązania — podobieństwo {:.0}%]\n{}",
                    similarity * 100.0,
                    example_query
                )
            }),
            serde_json::json!({
                "role": "assistant",
                "content": example_response
            }),
        ];

        // Find last user message index
        let last_user_idx = messages
            .iter()
            .rposition(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"));

        match last_user_idx {
            Some(idx) => {
                // Insert before the last user message
                for (i, msg) in injection.into_iter().enumerate() {
                    messages.insert(idx + i, msg);
                }
            }
            None => {
                // Prepend if no user message found
                for msg in injection.into_iter().rev() {
                    messages.insert(0, msg);
                }
            }
        }
    }
}

// ── Trait ─────────────────────────────────────────────────────────────────────

/// Trait for accessing the semantic cache from AppState.
pub trait HasSemanticCache: Clone + Send + Sync + 'static {
    fn semantic_cache(&self) -> &Arc<SemanticCacheState>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Get the current HEAD git commit hash (short, 8 chars).
async fn get_current_git_commit() -> String {
    tokio::task::spawn_blocking(|| {
        std::process::Command::new("git")
            .args(["rev-parse", "--short=8", "HEAD"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    })
    .await
    .unwrap_or_else(|_| "unknown".to_string())
}

/// Spawn a background task that cleans up expired cache entries every 5 minutes.
pub fn spawn_ttl_cleanup_loop(cache: Arc<SemanticCacheState>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            match cache.cleanup_expired().await {
                Ok(deleted) if deleted > 0 => {
                    tracing::info!("Semantic cache TTL cleanup: removed {} expired entries", deleted);
                }
                Err(e) => {
                    tracing::warn!("Semantic cache TTL cleanup failed: {}", e);
                }
                _ => {}
            }
        }
    });
}

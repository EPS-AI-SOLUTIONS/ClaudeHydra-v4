// handlers.rs — HTTP endpoints for the Semantic Cache system.
//
// Provides cache management, metrics, invalidation, and context compression APIs.
//
// Endpoints:
//   GET    /api/semantic-cache/stats       — cache metrics + Qdrant collection info
//   GET    /api/semantic-cache/health      — Qdrant + embedding health check
//   GET    /api/semantic-cache/config      — current configuration
//   PATCH  /api/semantic-cache/config      — update TTL, thresholds, enabled flag
//   GET    /api/semantic-cache/entries     — list cached entries (paginated)
//   DELETE /api/semantic-cache/entries/{id} — delete specific entry
//   POST   /api/semantic-cache/invalidate  — invalidate by git commit or flush all
//   POST   /api/semantic-cache/compress    — compress code on demand (AST-aware)

use axum::extract::{Json, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::compressor;
use super::HasSemanticCache;

// ── Router ───────────────────────────────────────────────────────────────────

pub fn semantic_cache_router<S>() -> Router<S>
where
    S: HasSemanticCache + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/api/semantic-cache/stats", get(cache_stats::<S>))
        .route("/api/semantic-cache/health", get(cache_health::<S>))
        .route(
            "/api/semantic-cache/config",
            get(get_config::<S>).patch(update_config::<S>),
        )
        .route("/api/semantic-cache/entries", get(list_entries::<S>))
        .route(
            "/api/semantic-cache/entries/{id}",
            delete(delete_entry::<S>),
        )
        .route(
            "/api/semantic-cache/invalidate",
            post(invalidate_cache::<S>),
        )
        .route("/api/semantic-cache/compress", post(compress_code::<S>))
}

// ── Stats ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct CacheStatsResponse {
    metrics: super::MetricsSnapshot,
    collection: Option<super::qdrant::CollectionStats>,
}

async fn cache_stats<S: HasSemanticCache>(State(state): State<S>) -> impl IntoResponse {
    let cache = state.semantic_cache();
    let metrics = cache.metrics.snapshot();

    let config = cache.config.read().await;
    let collection = cache
        .qdrant
        .collection_info(&config.collection_name)
        .await
        .ok();

    Json(CacheStatsResponse {
        metrics,
        collection,
    })
}

// ── Health ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct CacheHealthResponse {
    qdrant_reachable: bool,
    embedding_configured: bool,
    cache_enabled: bool,
    collection_exists: bool,
}

async fn cache_health<S: HasSemanticCache>(State(state): State<S>) -> impl IntoResponse {
    let cache = state.semantic_cache();
    let config = cache.config.read().await;

    let qdrant_reachable = cache.qdrant.health().await;
    let collection_exists = cache
        .qdrant
        .collection_info(&config.collection_name)
        .await
        .is_ok();

    Json(CacheHealthResponse {
        qdrant_reachable,
        embedding_configured: cache.embeddings.is_configured(),
        cache_enabled: config.enabled,
        collection_exists,
    })
}

// ── Config ───────────────────────────────────────────────────────────────────

async fn get_config<S: HasSemanticCache>(State(state): State<S>) -> impl IntoResponse {
    let cache = state.semantic_cache();
    let config = cache.config.read().await;
    Json(serde_json::to_value(&*config).unwrap_or_default())
}

#[derive(Debug, Deserialize)]
struct UpdateConfigRequest {
    enabled: Option<bool>,
    ttl_seconds: Option<u64>,
    exact_hit_threshold: Option<f64>,
    partial_hit_threshold: Option<f64>,
    max_entries: Option<u64>,
    cost_per_million_input_tokens: Option<f64>,
    cost_per_million_output_tokens: Option<f64>,
}

async fn update_config<S: HasSemanticCache>(
    State(state): State<S>,
    Json(req): Json<UpdateConfigRequest>,
) -> impl IntoResponse {
    let cache = state.semantic_cache();
    let mut config = cache.config.write().await;

    if let Some(enabled) = req.enabled {
        config.enabled = enabled;
    }
    if let Some(ttl) = req.ttl_seconds {
        config.ttl_seconds = ttl;
    }
    if let Some(threshold) = req.exact_hit_threshold {
        if (0.0..=1.0).contains(&threshold) {
            config.exact_hit_threshold = threshold;
        }
    }
    if let Some(threshold) = req.partial_hit_threshold {
        if (0.0..=1.0).contains(&threshold) {
            config.partial_hit_threshold = threshold;
        }
    }
    if let Some(max) = req.max_entries {
        config.max_entries = max;
    }
    if let Some(cost) = req.cost_per_million_input_tokens {
        config.cost_per_million_input_tokens = cost;
    }
    if let Some(cost) = req.cost_per_million_output_tokens {
        config.cost_per_million_output_tokens = cost;
    }

    tracing::info!("Semantic cache config updated: enabled={}, ttl={}s, exact_threshold={}, partial_threshold={}",
        config.enabled, config.ttl_seconds, config.exact_hit_threshold, config.partial_hit_threshold);

    (StatusCode::OK, Json(json!({ "status": "updated" })))
}

// ── List Entries (Paginated) ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ListEntriesQuery {
    limit: Option<usize>,
    offset: Option<String>,
}

#[derive(Serialize)]
struct ListEntriesResponse {
    entries: Vec<CacheEntry>,
    next_offset: Option<String>,
    total_estimate: u64,
}

#[derive(Serialize)]
struct CacheEntry {
    id: String,
    query_preview: String,
    model: String,
    provider: String,
    token_count: u64,
    hit_count: u64,
    created_at: String,
    ttl_expires_at: String,
    similarity_to_self: f64,
}

async fn list_entries<S: HasSemanticCache>(
    State(state): State<S>,
    Query(query): Query<ListEntriesQuery>,
) -> impl IntoResponse {
    let cache = state.semantic_cache();
    let config = cache.config.read().await;
    let limit = query.limit.unwrap_or(20).min(100);

    match cache
        .qdrant
        .scroll(&config.collection_name, limit, query.offset.as_deref())
        .await
    {
        Ok(result) => {
            let entries: Vec<CacheEntry> = result
                .points
                .iter()
                .map(|p| {
                    let payload = &p.payload;
                    CacheEntry {
                        id: p.id.clone(),
                        query_preview: payload
                            .get("query")
                            .and_then(|v| v.as_str())
                            .map(|s| s.chars().take(120).collect::<String>())
                            .unwrap_or_default(),
                        model: payload
                            .get("model")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string(),
                        provider: payload
                            .get("provider")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string(),
                        token_count: payload
                            .get("token_count")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0),
                        hit_count: payload
                            .get("hit_count")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0),
                        created_at: payload
                            .get("created_at")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        ttl_expires_at: payload
                            .get("ttl_expires_at")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        similarity_to_self: 1.0,
                    }
                })
                .collect();

            // Get total count
            let total = cache
                .qdrant
                .collection_info(&config.collection_name)
                .await
                .map(|info| info.points_count)
                .unwrap_or(0);

            Json(json!(ListEntriesResponse {
                entries,
                next_offset: result.next_page_offset,
                total_estimate: total,
            }))
        }
        Err(e) => Json(json!({
            "entries": [],
            "next_offset": null,
            "total_estimate": 0,
            "error": e
        })),
    }
}

// ── Delete Entry ─────────────────────────────────────────────────────────────

async fn delete_entry<S: HasSemanticCache>(
    State(state): State<S>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let cache = state.semantic_cache();
    let config = cache.config.read().await;

    match cache
        .qdrant
        .delete_by_filter(
            &config.collection_name,
            json!({
                "must": [{
                    "has_id": [id]
                }]
            }),
        )
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "deleted" }))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        ),
    }
}

// ── Invalidation ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct InvalidateRequest {
    /// If provided, invalidate all entries NOT matching this commit hash.
    git_commit_hash: Option<String>,
    /// If true, flush the entire cache.
    flush_all: Option<bool>,
}

async fn invalidate_cache<S: HasSemanticCache>(
    State(state): State<S>,
    Json(req): Json<InvalidateRequest>,
) -> impl IntoResponse {
    let cache = state.semantic_cache();

    if req.flush_all.unwrap_or(false) {
        let config = cache.config.read().await;
        match cache
            .qdrant
            .delete_collection(&config.collection_name)
            .await
        {
            Ok(()) => {
                // Recreate collection
                let _ = cache
                    .qdrant
                    .ensure_collection(&config.collection_name, config.vector_size)
                    .await;
                tracing::info!("Semantic cache FLUSHED — collection recreated");
                return (
                    StatusCode::OK,
                    Json(json!({ "status": "flushed", "action": "collection_recreated" })),
                );
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                );
            }
        }
    }

    if let Some(commit) = &req.git_commit_hash {
        match cache.invalidate_by_commit(commit).await {
            Ok(deleted) => {
                tracing::info!(
                    "Semantic cache invalidated by commit {}: ~{} entries removed",
                    commit,
                    deleted
                );
                (
                    StatusCode::OK,
                    Json(json!({
                        "status": "invalidated",
                        "commit": commit,
                        "deleted_estimate": deleted
                    })),
                )
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            ),
        }
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Provide git_commit_hash or set flush_all=true" })),
        )
    }
}

// ── Code Compression ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CompressRequest {
    /// File path (used for language detection)
    path: String,
    /// Source code content
    content: String,
}

async fn compress_code<S: HasSemanticCache>(
    State(_state): State<S>,
    Json(req): Json<CompressRequest>,
) -> impl IntoResponse {
    let result = compressor::compress_code_async(req.path, req.content).await;
    Json(serde_json::to_value(result).unwrap_or_default())
}

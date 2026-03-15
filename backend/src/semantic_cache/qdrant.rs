// qdrant.rs — Qdrant REST API client for semantic cache.
//
// Uses reqwest to talk directly to Qdrant on port 6333/6334.
// No external crate dependency — keeps the build lean.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Qdrant REST API client.
#[derive(Debug, Clone)]
pub struct QdrantClient {
    base_url: String,
    http: reqwest::Client,
}

/// A search result from Qdrant.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub score: f64,
    pub payload: Value,
}

/// Collection statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionStats {
    pub points_count: u64,
    pub segments_count: u64,
    pub status: String,
    pub vectors_count: u64,
}

/// Paginated scroll result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollResult {
    pub points: Vec<ScrollPoint>,
    pub next_page_offset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollPoint {
    pub id: String,
    pub payload: Value,
}

impl QdrantClient {
    pub fn new(base_url: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("Failed to build Qdrant HTTP client");

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            http,
        }
    }

    /// Ensure a collection exists with the given vector configuration.
    /// Creates it if it doesn't exist, no-ops if it already does.
    pub async fn ensure_collection(
        &self,
        collection_name: &str,
        vector_size: usize,
    ) -> Result<(), String> {
        let url = format!("{}/collections/{}", self.base_url, collection_name);

        // Check if collection already exists
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Qdrant unreachable: {e}"))?;

        if resp.status().is_success() {
            tracing::debug!("Qdrant collection '{}' already exists", collection_name);
            return Ok(());
        }

        // Create collection
        let body = serde_json::json!({
            "vectors": {
                "size": vector_size,
                "distance": "Cosine"
            },
            "optimizers_config": {
                "default_segment_number": 2
            },
            "replication_factor": 1
        });

        let resp = self
            .http
            .put(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to create collection: {e}"))?;

        if resp.status().is_success() {
            tracing::info!("Created Qdrant collection '{}' (vector_size={})", collection_name, vector_size);

            // Create payload indexes for common filter fields
            for field in ["ttl_expires_at", "git_commit_hash", "provider", "model"] {
                let index_url = format!(
                    "{}/collections/{}/index",
                    self.base_url, collection_name
                );
                let _ = self
                    .http
                    .put(&index_url)
                    .json(&serde_json::json!({
                        "field_name": field,
                        "field_schema": "keyword"
                    }))
                    .send()
                    .await;
            }

            // Range index for ttl_expires_at (for TTL cleanup)
            let index_url = format!(
                "{}/collections/{}/index",
                self.base_url, collection_name
            );
            let _ = self
                .http
                .put(&index_url)
                .json(&serde_json::json!({
                    "field_name": "hit_count",
                    "field_schema": "integer"
                }))
                .send()
                .await;

            Ok(())
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Qdrant create collection failed ({}): {}", status, body))
        }
    }

    /// Search for similar vectors in the collection.
    pub async fn search(
        &self,
        collection_name: &str,
        vector: &[f32],
        score_threshold: f64,
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        let url = format!(
            "{}/collections/{}/points/search",
            self.base_url, collection_name
        );

        let body = serde_json::json!({
            "vector": vector,
            "limit": limit,
            "score_threshold": score_threshold,
            "with_payload": true
        });

        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Qdrant search failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Qdrant search error ({}): {}", status, body));
        }

        let data: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse Qdrant response: {e}"))?;

        let results = data
            .get("result")
            .and_then(|r| r.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let id = item
                            .get("id")
                            .map(|v| match v {
                                Value::String(s) => s.clone(),
                                Value::Number(n) => n.to_string(),
                                _ => v.to_string(),
                            })?;
                        let score = item.get("score")?.as_f64()?;
                        let payload = item.get("payload").cloned().unwrap_or(Value::Null);

                        Some(SearchResult { id, score, payload })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(results)
    }

    /// Insert or update a point in the collection.
    pub async fn upsert(
        &self,
        collection_name: &str,
        point_id: &str,
        vector: &[f32],
        payload: Value,
    ) -> Result<(), String> {
        let url = format!(
            "{}/collections/{}/points?wait=true",
            self.base_url, collection_name
        );

        let body = serde_json::json!({
            "points": [{
                "id": point_id,
                "vector": vector,
                "payload": payload
            }]
        });

        let resp = self
            .http
            .put(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Qdrant upsert failed: {e}"))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Qdrant upsert error ({}): {}", status, body))
        }
    }

    /// Update the payload of an existing point (partial update).
    pub async fn update_payload(
        &self,
        collection_name: &str,
        point_id: &str,
        payload: Value,
    ) -> Result<(), String> {
        let url = format!(
            "{}/collections/{}/points/payload?wait=false",
            self.base_url, collection_name
        );

        let body = serde_json::json!({
            "points": [point_id],
            "payload": payload
        });

        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Qdrant payload update failed: {e}"))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Qdrant payload update error ({}): {}", status, body))
        }
    }

    /// Delete points by filter condition.
    /// Returns estimated number of deleted points.
    pub async fn delete_by_filter(
        &self,
        collection_name: &str,
        filter: Value,
    ) -> Result<u64, String> {
        let url = format!(
            "{}/collections/{}/points/delete?wait=true",
            self.base_url, collection_name
        );

        let body = serde_json::json!({
            "filter": filter
        });

        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Qdrant delete failed: {e}"))?;

        if resp.status().is_success() {
            let data: Value = resp.json().await.unwrap_or_default();
            // Qdrant doesn't return count for filter deletes, estimate from status
            let status = data
                .get("status")
                .and_then(|s| s.as_str())
                .unwrap_or("unknown");
            if status == "ok" {
                Ok(1) // At least acknowledge success
            } else {
                Ok(0)
            }
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Qdrant delete error ({}): {}", status, body))
        }
    }

    /// Get collection statistics.
    pub async fn collection_info(
        &self,
        collection_name: &str,
    ) -> Result<CollectionStats, String> {
        let url = format!("{}/collections/{}", self.base_url, collection_name);

        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Qdrant unreachable: {e}"))?;

        if !resp.status().is_success() {
            return Err("Collection not found".to_string());
        }

        let data: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse collection info: {e}"))?;

        let result = data.get("result").unwrap_or(&Value::Null);

        Ok(CollectionStats {
            points_count: result
                .get("points_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            segments_count: result
                .get("segments_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            status: result
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            vectors_count: result
                .get("vectors_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
        })
    }

    /// Scroll through collection entries (paginated).
    pub async fn scroll(
        &self,
        collection_name: &str,
        limit: usize,
        offset: Option<&str>,
    ) -> Result<ScrollResult, String> {
        let url = format!(
            "{}/collections/{}/points/scroll",
            self.base_url, collection_name
        );

        let mut body = serde_json::json!({
            "limit": limit,
            "with_payload": true,
            "with_vector": false
        });

        if let Some(off) = offset {
            body["offset"] = Value::String(off.to_string());
        }

        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Qdrant scroll failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Qdrant scroll error ({}): {}", status, body));
        }

        let data: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse scroll response: {e}"))?;

        let result = data.get("result").unwrap_or(&Value::Null);

        let points = result
            .get("points")
            .and_then(|p| p.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let id = item.get("id").map(|v| match v {
                            Value::String(s) => s.clone(),
                            Value::Number(n) => n.to_string(),
                            _ => v.to_string(),
                        })?;
                        let payload = item.get("payload").cloned().unwrap_or(Value::Null);
                        Some(ScrollPoint { id, payload })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let next_page_offset = result
            .get("next_page_offset")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok(ScrollResult {
            points,
            next_page_offset,
        })
    }

    /// Delete the entire collection (for testing / reset).
    pub async fn delete_collection(&self, collection_name: &str) -> Result<(), String> {
        let url = format!("{}/collections/{}", self.base_url, collection_name);

        let resp = self
            .http
            .delete(&url)
            .send()
            .await
            .map_err(|e| format!("Qdrant delete collection failed: {e}"))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Qdrant delete collection error ({}): {}", status, body))
        }
    }

    /// Health check — is Qdrant reachable?
    pub async fn health(&self) -> bool {
        match self
            .http
            .get(format!("{}/healthz", self.base_url))
            .send()
            .await
        {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }
}

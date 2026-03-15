// embeddings.rs — Embedding generation client for Semantic Cache.
//
// Uses Gemini Embedding API (gemini-embedding-2-preview, 3072 dims) to convert
// text queries into dense vectors for Qdrant similarity search.
//
// Credential resolution chain:
//   1. Explicit API key (constructor parameter)
//   2. GOOGLE_API_KEY env var
//   3. GEMINI_API_KEY env var

const GEMINI_EMBEDDING_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/models";

/// Client for generating text embeddings via the Gemini Embedding API.
#[derive(Debug, Clone)]
pub struct EmbeddingClient {
    api_key: Option<String>,
    http: reqwest::Client,
}

impl EmbeddingClient {
    pub fn new(api_key: Option<String>) -> Self {
        let resolved_key = api_key
            .or_else(|| std::env::var("GOOGLE_API_KEY").ok())
            .or_else(|| std::env::var("GEMINI_API_KEY").ok());

        if resolved_key.is_none() {
            tracing::warn!(
                "No Google API key found for embeddings — semantic cache will not generate vectors"
            );
        }

        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build embedding HTTP client");

        Self {
            api_key: resolved_key,
            http,
        }
    }

    /// Generate an embedding vector for the given text.
    ///
    /// Returns a Vec<f32> of `vector_size` dimensions (3072 for gemini-embedding-2-preview).
    pub async fn embed(&self, text: &str, model: &str) -> Result<Vec<f32>, String> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| "No Google API key configured for embedding generation".to_string())?;

        let url = format!(
            "{}/{}:embedContent?key={}",
            GEMINI_EMBEDDING_URL, model, api_key
        );

        let body = serde_json::json!({
            "model": format!("models/{}", model),
            "content": {
                "parts": [{
                    "text": text
                }]
            }
        });

        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Embedding API request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Embedding API error ({}): {}", status, body));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse embedding response: {e}"))?;

        let values = data
            .get("embedding")
            .and_then(|e| e.get("values"))
            .and_then(|v| v.as_array())
            .ok_or_else(|| "Unexpected embedding response format".to_string())?;

        let vector: Vec<f32> = values
            .iter()
            .filter_map(|v| v.as_f64().map(|f| f as f32))
            .collect();

        if vector.is_empty() {
            return Err("Empty embedding vector returned".to_string());
        }

        Ok(vector)
    }

    /// Check if the embedding client has a valid API key.
    pub fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }
}

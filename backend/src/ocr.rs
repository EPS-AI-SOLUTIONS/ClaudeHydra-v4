// Jaskier Shared Pattern -- ocr
// ClaudeHydra v4 — OCR via Claude Vision API (primary) / Gemini Vision (fallback)
//
// Implements `HasOcrProvider` from jaskier-tools with a dual-provider strategy:
//   - Primary: Claude Vision API (Anthropic)
//   - Fallback: Gemini Vision API (Google)
//
// All handler logic, types, page splitting, and SSE events live in jaskier-tools.
// This file only contains:
//   1. HasOcrProvider impl for AppState (dual-provider extraction)
//   2. Re-exports of generic handlers wired to AppState
//
// Endpoints (registered in lib.rs):
//   POST /api/ocr              — synchronous OCR (single image or PDF)
//   POST /api/ocr/stream       — SSE streaming OCR with progress events
//   POST /api/ocr/batch/stream — SSE batch OCR (multiple files)
//   GET  /api/ocr/history      — paginated OCR history
//   GET  /api/ocr/history/{id} — single history entry (full text)
//   DELETE /api/ocr/history/{id} — delete history entry

use serde_json::{Value, json};

use crate::state::AppState;

// ── Re-export shared types from jaskier-tools ────────────────────────────────

pub use jaskier_tools::ocr::{
    OcrBatchItem, OcrBatchItemResult, OcrBatchRequest, OcrHistoryEntry, OcrHistoryFull,
    OcrHistoryParams, OcrPage, OcrRequest, OcrResponse, PaginatedOcrHistory,
};

// ── Re-export helpers (used by tools/mod.rs and tools/pdf_tools.rs) ─────────

pub use jaskier_tools::ocr::helpers::{OCR_PROMPT, STRUCTURED_EXTRACTION_PROMPT};

// ── Constants (CH-specific) ─────────────────────────────────────────────────

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL: &str = "claude-sonnet-4-6";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_OCR_MODEL: &str = "gemini-3.1-flash-preview";

// ── HasOcrProvider implementation for ClaudeHydra ────────────────────────────

use jaskier_tools::ocr::HasOcrProvider;

impl HasOcrProvider for AppState {
    fn db(&self) -> &sqlx::PgPool {
        &self.base.db
    }

    fn ocr_history_table(&self) -> &'static str {
        "ch_ocr_history"
    }

    async fn ocr_extract(
        &self,
        data_b64: &str,
        mime_type: &str,
        prompt: &str,
    ) -> Result<(String, String, Option<f64>), String> {
        // Try Claude Vision API first
        let api_key = {
            let rt = self.runtime.read().await;
            rt.api_keys.get("ANTHROPIC_API_KEY").cloned()
        };

        if let Some(key) = api_key {
            match ocr_with_claude(&self.http_client, &key, data_b64, mime_type, prompt).await {
                Ok((text, confidence)) => return Ok((text, "claude".to_string(), confidence)),
                Err(e) => {
                    tracing::warn!("Claude OCR failed, trying Gemini fallback: {e}");
                }
            }
        }

        // Fallback: Gemini Vision API via Google OAuth
        if let Some((credential, is_oauth)) =
            jaskier_oauth::google::get_google_credential(self).await
        {
            let (text, confidence) = ocr_with_gemini(
                &self.http_client,
                &credential,
                is_oauth,
                data_b64,
                mime_type,
                prompt,
            )
            .await?;
            return Ok((text, "gemini".to_string(), confidence));
        }

        Err("No API credentials configured (Anthropic or Google)".to_string())
    }

    async fn structured_extract(&self, ocr_text: &str) -> Result<Value, String> {
        extract_structured_data(self, ocr_text).await
    }
}

// ── Handler re-exports (wired to AppState via HasOcrProvider) ────────────────

pub async fn ocr(
    state: axum::extract::State<AppState>,
    body: axum::Json<OcrRequest>,
) -> Result<axum::Json<OcrResponse>, impl axum::response::IntoResponse> {
    jaskier_tools::ocr::ocr_generic(state, body).await
}

pub async fn ocr_stream(
    state: axum::extract::State<AppState>,
    body: axum::Json<OcrRequest>,
) -> Result<
    axum::response::sse::Sse<impl futures_util::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>>,
    impl axum::response::IntoResponse,
> {
    jaskier_tools::ocr::ocr_stream_generic(state, body).await
}

pub async fn ocr_batch_stream(
    state: axum::extract::State<AppState>,
    body: axum::Json<OcrBatchRequest>,
) -> Result<
    axum::response::sse::Sse<impl futures_util::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>>,
    impl axum::response::IntoResponse,
> {
    jaskier_tools::ocr::ocr_batch_stream_generic(state, body).await
}

pub async fn ocr_history(
    state: axum::extract::State<AppState>,
    params: axum::extract::Query<OcrHistoryParams>,
) -> Result<axum::Json<PaginatedOcrHistory>, (axum::http::StatusCode, axum::Json<Value>)> {
    jaskier_tools::ocr::ocr_history_generic(state, params).await
}

pub async fn ocr_history_item(
    state: axum::extract::State<AppState>,
    path: axum::extract::Path<String>,
) -> Result<axum::Json<OcrHistoryFull>, (axum::http::StatusCode, axum::Json<Value>)> {
    jaskier_tools::ocr::ocr_history_item_generic(state, path).await
}

pub async fn ocr_history_delete(
    state: axum::extract::State<AppState>,
    path: axum::extract::Path<String>,
) -> Result<axum::Json<Value>, (axum::http::StatusCode, axum::Json<Value>)> {
    jaskier_tools::ocr::ocr_history_delete_generic(state, path).await
}

// ── Public helpers for agent tool fallback ────────────────────────────────────

/// OCR a PDF document. Used by `read_pdf` tool as fallback when `pdf-extract`
/// returns empty text (scanned/image-based PDFs).
pub async fn ocr_pdf_text(
    state: &AppState,
    data_b64: &str,
    page_range: Option<&str>,
) -> Result<String, String> {
    jaskier_tools::ocr::ocr_pdf_text_generic(state, data_b64, page_range).await
}

/// OCR a single image. Used by `analyze_image` tool when `extract_text` is true.
pub async fn ocr_image_text(
    state: &AppState,
    data_b64: &str,
    mime_type: &str,
) -> Result<String, String> {
    jaskier_tools::ocr::ocr_image_text_generic(state, data_b64, mime_type).await
}

// ── Claude Vision OCR (CH-specific) ─────────────────────────────────────────

async fn ocr_with_claude(
    client: &reqwest::Client,
    api_key: &str,
    data_b64: &str,
    mime_type: &str,
    prompt: &str,
) -> Result<(String, Option<f64>), String> {
    // Claude supports PDFs via "document" source type, images via "image" source type
    let is_pdf = mime_type == "application/pdf";

    let source_content = if is_pdf {
        json!({
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": mime_type,
                "data": data_b64
            }
        })
    } else {
        json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": mime_type,
                "data": data_b64
            }
        })
    };

    let request_body = json!({
        "model": CLAUDE_MODEL,
        "max_tokens": 16384,
        "messages": [{
            "role": "user",
            "content": [
                source_content,
                {
                    "type": "text",
                    "text": prompt
                }
            ]
        }]
    });

    let response = client
        .post(CLAUDE_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Claude API request failed: {e}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Claude response: {e}"))?;

    if !status.is_success() {
        let msg = body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown Claude API error");
        return Err(format!("Claude API error ({status}): {msg}"));
    }

    let text = body["content"]
        .as_array()
        .and_then(|blocks| {
            blocks
                .iter()
                .filter_map(|b| {
                    if b["type"].as_str() == Some("text") {
                        b["text"].as_str().map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .next()
        })
        .unwrap_or_default();

    if text.is_empty() {
        return Err("Claude returned empty OCR result".to_string());
    }

    // Claude API does not expose avgLogprobs — confidence unavailable
    Ok((text, None))
}

// ── Gemini Vision OCR (fallback) ────────────────────────────────────────────

async fn ocr_with_gemini(
    client: &reqwest::Client,
    credential: &str,
    is_oauth: bool,
    data_b64: &str,
    mime_type: &str,
    prompt: &str,
) -> Result<(String, Option<f64>), String> {
    let url = format!("{GEMINI_API_BASE}/{GEMINI_OCR_MODEL}:generateContent");

    let request_body = json!({
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": data_b64
                    }
                },
                {
                    "text": prompt
                }
            ]
        }],
        "generationConfig": {
            "temperature": 1.0, // Gemini 3: ALWAYS 1.0 — lower values cause looping/degradation
            "maxOutputTokens": 16384
        }
    });

    let builder = client.post(&url).json(&request_body);
    let builder = jaskier_oauth::google::apply_google_auth(builder, credential, is_oauth);

    let response = builder
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Gemini API request failed: {e}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gemini response: {e}"))?;

    if !status.is_success() {
        let msg = body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown Gemini API error");
        return Err(format!("Gemini API error ({status}): {msg}"));
    }

    let text = body["candidates"][0]["content"]["parts"]
        .as_array()
        .and_then(|parts| {
            parts
                .iter()
                .filter_map(|p| p["text"].as_str())
                .next()
                .map(|s| s.to_string())
        })
        .unwrap_or_default();

    if text.is_empty() {
        return Err("Gemini returned empty OCR result".to_string());
    }

    // Extract confidence from avgLogprobs (if available)
    let confidence = body["candidates"][0]["avgLogprobs"]
        .as_f64()
        .map(|logprob| logprob.exp().clamp(0.0, 1.0));

    Ok((text, confidence))
}

// ── Structured data extraction ──────────────────────────────────────────────

/// Extract structured data from OCR text. Uses Gemini (text-only, simpler) since
/// this is a second-pass analysis that doesn't need vision capabilities.
async fn extract_structured_data(state: &AppState, ocr_text: &str) -> Result<Value, String> {
    let (credential, is_oauth) = jaskier_oauth::google::get_google_credential(state)
        .await
        .ok_or_else(|| {
            "No Google API credential configured for structured extraction".to_string()
        })?;

    let url = format!("{GEMINI_API_BASE}/{GEMINI_OCR_MODEL}:generateContent");

    let prompt = format!("{STRUCTURED_EXTRACTION_PROMPT}\n\nOCR TEXT:\n{ocr_text}");

    let request_body = json!({
        "contents": [{
            "parts": [{ "text": prompt }]
        }],
        "generationConfig": {
            "temperature": 1.0, // Gemini 3: ALWAYS 1.0 — lower values cause looping/degradation
            "maxOutputTokens": 4096
        }
    });

    let builder = state.http_client.post(&url).json(&request_body);
    let builder = jaskier_oauth::google::apply_google_auth(builder, &credential, is_oauth);

    let response = builder
        .send()
        .await
        .map_err(|e| format!("Structured extraction request failed: {e}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse structured extraction response: {e}"))?;

    if !status.is_success() {
        return Err("Structured extraction API error".to_string());
    }

    let raw_text = body["candidates"][0]["content"]["parts"]
        .as_array()
        .and_then(|parts| parts.iter().filter_map(|p| p["text"].as_str()).next())
        .unwrap_or("");

    // Try to parse JSON directly, or extract from markdown code block
    let trimmed = raw_text.trim();
    let json_str = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };

    serde_json::from_str(json_str).map_err(|e| format!("Failed to parse structured data JSON: {e}"))
}

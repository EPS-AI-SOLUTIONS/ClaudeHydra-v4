// tools/image_tools.rs
// ClaudeHydra — Image analysis via Claude Vision API
//! Image analysis tool using Claude Vision for ClaudeHydra agents.

use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;

/// Maximum image file size (5 MB — Claude limit).
const MAX_IMAGE_SIZE: u64 = 5 * 1024 * 1024;

/// Allowed image extensions.
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif"];

/// OCR prompt for text extraction mode.
const OCR_PROMPT: &str = "\
Extract ALL text from this image exactly as written. Preserve:\n\
- Line breaks and paragraph structure\n\
- Formatting (headers, lists, tables)\n\
- Special characters and numbers\n\
- Reading order (left-to-right, top-to-bottom)\n\
\n\
If the text is handwritten, transcribe it as accurately as possible.\n\
If there are tables, format them using markdown table syntax.\n\
Return ONLY the extracted text, no descriptions or commentary.";

/// Analyze an image using Claude Vision API.
/// When `extract_text` is true, uses OCR prompt instead of description prompt.
pub async fn tool_analyze_image(
    path: &str,
    prompt: Option<&str>,
    extract_text: Option<bool>,
    http_client: &reqwest::Client,
    api_keys: &HashMap<String, String>,
) -> Result<(String, bool), String> {
    let file_path = Path::new(path);

    if !file_path.exists() {
        return Err(format!("Image file not found: {}", path));
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!(
            "Not a supported image format: {}. Supported: {:?}",
            path, IMAGE_EXTENSIONS
        ));
    }

    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("Cannot read metadata: {}", e))?;
    if metadata.len() > MAX_IMAGE_SIZE {
        return Err(format!(
            "Image too large: {} bytes (max {} MB). Claude supports up to 5 MB per image.",
            metadata.len(),
            MAX_IMAGE_SIZE / (1024 * 1024)
        ));
    }

    let bytes = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("Cannot read image: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let media_type = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    };

    let analysis_prompt = if extract_text.unwrap_or(false) {
        prompt.unwrap_or(OCR_PROMPT)
    } else {
        prompt.unwrap_or(
            "Describe this image in detail. Include any text, objects, people, colors, layout, and notable features.",
        )
    };

    // Get API key
    let api_key = api_keys
        .get("ANTHROPIC_API_KEY")
        .or_else(|| api_keys.get("anthropic_api_key"))
        .ok_or_else(|| "ANTHROPIC_API_KEY not configured".to_string())?;

    let body = json!({
        "model": "claude-sonnet-4-6",
        "max_tokens": 2048,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": b64
                    }
                },
                {
                    "type": "text",
                    "text": analysis_prompt
                }
            ]
        }]
    });

    let response = http_client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Claude API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Claude API error {}: {}", status, text));
    }

    let result: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

    let text = result["content"][0]["text"]
        .as_str()
        .unwrap_or("No analysis returned")
        .to_string();

    let filename = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image");
    let label = if extract_text.unwrap_or(false) { "OCR" } else { "Image Analysis" };
    let output = format!(
        "### {}: {} ({}, {} bytes)\n\n{}",
        label, filename, media_type, metadata.len(), text
    );

    Ok((output, false))
}

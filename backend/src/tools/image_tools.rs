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

/// Analyze an image using Claude Vision API.
pub async fn tool_analyze_image(
    path: &str,
    prompt: Option<&str>,
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

    let analysis_prompt = prompt.unwrap_or(
        "Describe this image in detail. Include any text, objects, people, colors, layout, and notable features.",
    );

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
    let output = format!(
        "### Image Analysis: {} ({}, {} bytes)\n\n{}",
        filename, media_type, metadata.len(), text
    );

    Ok((output, false))
}

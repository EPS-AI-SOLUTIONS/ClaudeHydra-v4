//! File listing and native folder browser endpoints.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════════
//  Request types (local to this module)
// ═══════════════════════════════════════════════════════════════════════

#[derive(Debug, serde::Deserialize)]
pub struct FileListRequest {
    #[serde(default)]
    pub directory: String,
    #[serde(default)]
    pub show_hidden: bool,
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/files/list
// ═══════════════════════════════════════════════════════════════════════

pub async fn list_files(
    State(_state): State<AppState>,
    Json(req): Json<FileListRequest>,
) -> Result<Json<Value>, StatusCode> {
    let dir = if req.directory.is_empty() {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    } else {
        req.directory
    };

    let path = std::path::Path::new(&dir);
    if !path.is_dir() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| {
        tracing::error!("Failed to read directory '{}': {}", dir, e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    for entry in read_dir.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files unless requested
        if !req.show_hidden && file_name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().ok();
        let is_dir = metadata
            .as_ref()
            .map(std::fs::Metadata::is_dir)
            .unwrap_or(false);
        let size = metadata.as_ref().map(std::fs::Metadata::len).unwrap_or(0);

        entries.push(json!({
            "name": file_name,
            "path": entry.path().to_string_lossy(),
            "is_directory": is_dir,
            "size": size,
        }));
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        let a_dir = a
            .get("is_directory")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        let b_dir = b
            .get("is_directory")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        match (b_dir, a_dir) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => {
                let a_name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                a_name.to_lowercase().cmp(&b_name.to_lowercase())
            }
        }
    });

    Ok(Json(json!({
        "directory": dir,
        "entries": entries,
    })))
}

// ═══════════════════════════════════════════════════════════════════════
//  POST /api/files/browse — native Windows FolderBrowserDialog
// ═══════════════════════════════════════════════════════════════════════

pub async fn browse_directory(
    State(_state): State<AppState>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let initial_dir = body
        .get("initial_directory")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Open native folder dialog via Python tkinter
    // (policy §8: no powershell — COM automation uses Python pywin32/tkinter)
    let python_script = r#"
import tkinter as tk
from tkinter import filedialog
import os, sys
root = tk.Tk()
root.withdraw()
root.wm_attributes('-topmost', 1)
initial = os.environ.get('JASKIER_INITIAL_DIR') or None
path = filedialog.askdirectory(title='Select working directory', initialdir=initial)
print(path if path else 'CANCELLED')
sys.stdout.flush()
"#;

    let mut cmd = tokio::process::Command::new("python");
    cmd.args(["-c", python_script]);
    if !initial_dir.is_empty() {
        cmd.env("JASKIER_INITIAL_DIR", initial_dir);
    }
    let output = cmd.output().await;

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if stdout == "CANCELLED" || stdout.is_empty() {
                Json(json!({ "cancelled": true }))
            } else {
                Json(json!({ "path": stdout }))
            }
        }
        Err(e) => {
            tracing::error!("Failed to run folder dialog: {}", e);
            Json(json!({ "error": "Failed to open folder dialog" }))
        }
    }
}

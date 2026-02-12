use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};
use sysinfo::System;

use crate::models::*;
use crate::state::SharedState;

// ═══════════════════════════════════════════════════════════════════════
//  Health & System
// ═══════════════════════════════════════════════════════════════════════

pub async fn health_check(State(state): State<SharedState>) -> Json<Value> {
    let (uptime, ollama_host, client, has_anthropic, has_google) = {
        let st = state.lock().unwrap();
        (
            st.start_time.elapsed().as_secs(),
            st.settings.ollama_host.clone(),
            st.client.clone(),
            st.api_keys.contains_key("ANTHROPIC_API_KEY"),
            st.api_keys.contains_key("GOOGLE_API_KEY"),
        )
    };

    let ollama_connected = client
        .get(format!("{}/api/version", ollama_host))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    let resp = HealthResponse {
        status: "ok".to_string(),
        version: "4.0.0".to_string(),
        app: "ClaudeHydra".to_string(),
        uptime_seconds: uptime,
        ollama_connected,
        providers: vec![
            ProviderInfo {
                name: "ollama".to_string(),
                available: ollama_connected,
            },
            ProviderInfo {
                name: "anthropic".to_string(),
                available: has_anthropic,
            },
            ProviderInfo {
                name: "google".to_string(),
                available: has_google,
            },
        ],
    };

    Json(serde_json::to_value(resp).unwrap())
}

pub async fn system_stats() -> Json<Value> {
    let mut sys = System::new_all();
    sys.refresh_all();

    // Brief pause then re-read CPU so the first sample isn't always 0
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    sys.refresh_cpu_usage();

    let cpu_usage: f32 = {
        let cpus = sys.cpus();
        if cpus.is_empty() {
            0.0
        } else {
            cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32
        }
    };

    let total_mem = sys.total_memory() as f64 / 1_048_576.0;
    let used_mem = sys.used_memory() as f64 / 1_048_576.0;

    let stats = SystemStats {
        cpu_usage_percent: cpu_usage,
        memory_used_mb: used_mem,
        memory_total_mb: total_mem,
        platform: std::env::consts::OS.to_string(),
    };

    Json(serde_json::to_value(stats).unwrap())
}

// ═══════════════════════════════════════════════════════════════════════
//  Agents
// ═══════════════════════════════════════════════════════════════════════

pub async fn list_agents(State(state): State<SharedState>) -> Json<Value> {
    let st = state.lock().unwrap();
    Json(serde_json::to_value(&st.agents).unwrap())
}

// ═══════════════════════════════════════════════════════════════════════
//  Ollama Proxy
// ═══════════════════════════════════════════════════════════════════════

pub async fn ollama_health(State(state): State<SharedState>) -> Json<Value> {
    let (host, client) = {
        let st = state.lock().unwrap();
        (st.settings.ollama_host.clone(), st.client.clone())
    };

    let result = client
        .get(format!("{}/api/version", host))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await;

    let (connected, version) = match result {
        Ok(resp) if resp.status().is_success() => {
            let body: Value = resp.json().await.unwrap_or_default();
            let ver = body
                .get("version")
                .and_then(|v| v.as_str())
                .map(String::from);
            (true, ver)
        }
        _ => (false, None),
    };

    let resp = OllamaHealthResponse { connected, version };
    Json(serde_json::to_value(resp).unwrap())
}

pub async fn ollama_models(State(state): State<SharedState>) -> Result<Json<Value>, StatusCode> {
    let (host, client) = {
        let st = state.lock().unwrap();
        (st.settings.ollama_host.clone(), st.client.clone())
    };

    let resp = client
        .get(format!("{}/api/tags", host))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let body: Value = resp.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

    let models: Vec<OllamaModel> = body
        .get("models")
        .and_then(|m| serde_json::from_value::<Vec<OllamaModel>>(m.clone()).ok())
        .unwrap_or_default();

    let out = OllamaModelsResponse { models };
    Ok(Json(serde_json::to_value(out).unwrap()))
}

pub async fn ollama_chat(
    State(state): State<SharedState>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<Value>, StatusCode> {
    let (host, default_model, client) = {
        let st = state.lock().unwrap();
        (
            st.settings.ollama_host.clone(),
            st.settings.default_model.clone(),
            st.client.clone(),
        )
    };

    let model = req.model.unwrap_or(default_model);

    // Build Ollama-format messages
    let ollama_messages: Vec<Value> = req
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut ollama_body = json!({
        "model": model,
        "messages": ollama_messages,
        "stream": false,
    });

    if let Some(temp) = req.temperature {
        ollama_body["options"] = json!({ "temperature": temp });
    }

    let resp = client
        .post(format!("{}/api/chat", host))
        .json(&ollama_body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }

    let body: Value = resp.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

    let content = body
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let response_model = body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or(&model)
        .to_string();

    let usage = {
        let prompt_tokens =
            body.get("prompt_eval_count").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let completion_tokens =
            body.get("eval_count").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        if prompt_tokens > 0 || completion_tokens > 0 {
            Some(UsageInfo {
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
            })
        } else {
            None
        }
    };

    let chat_resp = ChatResponse {
        id: uuid::Uuid::new_v4().to_string(),
        message: ChatMessage {
            role: "assistant".to_string(),
            content,
            model: Some(response_model.clone()),
            timestamp: Some(now_iso8601()),
        },
        model: response_model,
        usage,
    };

    Ok(Json(serde_json::to_value(chat_resp).unwrap()))
}

// ═══════════════════════════════════════════════════════════════════════
//  Claude Proxy
// ═══════════════════════════════════════════════════════════════════════

pub async fn claude_chat(
    State(state): State<SharedState>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (api_key, client) = {
        let st = state.lock().unwrap();
        let key = st
            .api_keys
            .get("ANTHROPIC_API_KEY")
            .cloned()
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "ANTHROPIC_API_KEY not configured" })),
                )
            })?;
        (key, st.client.clone())
    };

    let model = req
        .model
        .unwrap_or_else(|| "claude-sonnet-4-20250514".to_string());
    let max_tokens = req.max_tokens.unwrap_or(4096);

    let messages: Vec<Value> = req
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    });

    if let Some(temp) = req.temperature {
        body["temperature"] = json!(temp);
    }

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("Failed to reach Anthropic API: {}", e) })),
            )
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body: Value = resp.json().await.unwrap_or_default();
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(json!({ "error": err_body })),
        ));
    }

    let resp_body: Value = resp.json().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Invalid JSON from Anthropic: {}", e) })),
        )
    })?;

    // Extract text from Anthropic content blocks
    let content = resp_body
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<&str>>()
                .join("")
        })
        .unwrap_or_default();

    let response_model = resp_body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or(&model)
        .to_string();

    let usage = resp_body.get("usage").map(|u| UsageInfo {
        prompt_tokens: u
            .get("input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        completion_tokens: u
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        total_tokens: (u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
            + u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0))
            as u32,
    });

    let chat_resp = ChatResponse {
        id: resp_body
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        message: ChatMessage {
            role: "assistant".to_string(),
            content,
            model: Some(response_model.clone()),
            timestamp: Some(now_iso8601()),
        },
        model: response_model,
        usage,
    };

    Ok(Json(serde_json::to_value(chat_resp).unwrap()))
}

// ═══════════════════════════════════════════════════════════════════════
//  Settings
// ═══════════════════════════════════════════════════════════════════════

pub async fn get_settings(State(state): State<SharedState>) -> Json<Value> {
    let st = state.lock().unwrap();
    Json(serde_json::to_value(&st.settings).unwrap())
}

pub async fn update_settings(
    State(state): State<SharedState>,
    Json(new_settings): Json<AppSettings>,
) -> Json<Value> {
    let mut st = state.lock().unwrap();
    st.settings = new_settings;
    Json(serde_json::to_value(&st.settings).unwrap())
}

pub async fn set_api_key(
    State(state): State<SharedState>,
    Json(req): Json<ApiKeyRequest>,
) -> Json<Value> {
    let mut st = state.lock().unwrap();
    st.api_keys.insert(req.provider.clone(), req.key);
    Json(json!({ "status": "ok", "provider": req.provider }))
}

// ═══════════════════════════════════════════════════════════════════════
//  Sessions & History
// ═══════════════════════════════════════════════════════════════════════

pub async fn list_sessions(State(state): State<SharedState>) -> Json<Value> {
    let st = state.lock().unwrap();
    let summaries: Vec<SessionSummary> = st
        .sessions
        .iter()
        .map(|s| SessionSummary {
            id: s.id.clone(),
            title: s.title.clone(),
            created_at: s.created_at.clone(),
            message_count: s.messages.len(),
        })
        .collect();
    Json(serde_json::to_value(summaries).unwrap())
}

pub async fn create_session(
    State(state): State<SharedState>,
    Json(req): Json<CreateSessionRequest>,
) -> (StatusCode, Json<Value>) {
    let session = Session {
        id: uuid::Uuid::new_v4().to_string(),
        title: req.title,
        created_at: now_iso8601(),
        messages: Vec::new(),
    };

    let mut st = state.lock().unwrap();
    st.current_session_id = Some(session.id.clone());
    st.sessions.push(session.clone());

    (
        StatusCode::CREATED,
        Json(serde_json::to_value(session).unwrap()),
    )
}

pub async fn get_session(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let st = state.lock().unwrap();
    let session = st.sessions.iter().find(|s| s.id == id).cloned();
    match session {
        Some(s) => Ok(Json(serde_json::to_value(s).unwrap())),
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn delete_session(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let mut st = state.lock().unwrap();
    let idx = st.sessions.iter().position(|s| s.id == id);
    match idx {
        Some(i) => {
            st.sessions.remove(i);
            if st.current_session_id.as_deref() == Some(&id) {
                st.current_session_id = None;
            }
            Ok(Json(json!({ "status": "deleted", "id": id })))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn add_session_message(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(req): Json<AddMessageRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    let mut st = state.lock().unwrap();
    let session = st.sessions.iter_mut().find(|s| s.id == id);
    match session {
        Some(s) => {
            let entry = HistoryEntry {
                id: uuid::Uuid::new_v4().to_string(),
                role: req.role,
                content: req.content,
                model: req.model,
                agent: req.agent,
                timestamp: now_iso8601(),
            };
            s.messages.push(entry.clone());
            Ok((
                StatusCode::CREATED,
                Json(serde_json::to_value(entry).unwrap()),
            ))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════

/// Simple ISO-8601 UTC timestamp without pulling in the chrono crate.
fn now_iso8601() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();

    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;

    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, h, m, s
    )
}

fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Civil date algorithm (Howard Hinnant)
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

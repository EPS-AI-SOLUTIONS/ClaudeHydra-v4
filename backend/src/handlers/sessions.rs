//! Session CRUD, message storage, and AI title generation.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::models::*;
use crate::state::AppState;

use super::{send_to_anthropic, MAX_MESSAGE_LENGTH, MAX_TITLE_LENGTH};

// ═══════════════════════════════════════════════════════════════════════
//  Pagination
// ═══════════════════════════════════════════════════════════════════════

#[derive(Debug, serde::Deserialize)]
pub struct PaginationParams {
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(default)]
    pub after: Option<String>,
}

// ═══════════════════════════════════════════════════════════════════════
//  List sessions (cursor + offset pagination)
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(get, path = "/api/sessions", tag = "sessions",
    responses((status = 200, description = "Paginated session list")))]
pub async fn list_sessions(
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Value>, StatusCode> {
    let limit = params.limit.unwrap_or(100).clamp(1, 500);

    let rows = if let Some(ref cursor_id) = params.after {
        let cursor_uuid = uuid::Uuid::parse_str(cursor_id).map_err(|_| {
            tracing::warn!("list_sessions: invalid cursor UUID: {}", cursor_id);
            StatusCode::BAD_REQUEST
        })?;
        sqlx::query_as::<_, SessionSummaryRow>(
            "SELECT s.id, s.title, s.created_at, \
             (SELECT COUNT(*) FROM ch_messages WHERE session_id = s.id) as message_count, \
             s.working_directory \
             FROM ch_sessions s \
             WHERE s.updated_at < (SELECT updated_at FROM ch_sessions WHERE id = $1) \
             ORDER BY s.updated_at DESC \
             LIMIT $2",
        )
        .bind(cursor_uuid)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
    } else {
        let offset = params.offset.unwrap_or(0).max(0);
        sqlx::query_as::<_, SessionSummaryRow>(
            "SELECT s.id, s.title, s.created_at, \
             (SELECT COUNT(*) FROM ch_messages WHERE session_id = s.id) as message_count, \
             s.working_directory \
             FROM ch_sessions s ORDER BY s.updated_at DESC \
             LIMIT $1 OFFSET $2",
        )
        .bind(limit + 1)
        .bind(offset)
        .fetch_all(&state.db)
        .await
    }
    .map_err(|e| {
        tracing::error!("Failed to list sessions: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_more = rows.len() as i64 > limit;
    let rows_trimmed: Vec<_> = rows.into_iter().take(limit as usize).collect();
    let next_cursor = if has_more {
        rows_trimmed.last().map(|r| r.id.to_string())
    } else {
        None
    };

    let summaries: Vec<SessionSummary> = rows_trimmed
        .into_iter()
        .map(|r| SessionSummary {
            id: r.id.to_string(),
            title: r.title,
            created_at: r.created_at.to_rfc3339(),
            message_count: r.message_count as usize,
            working_directory: r.working_directory,
        })
        .collect();

    Ok(Json(json!({
        "sessions": summaries,
        "has_more": has_more,
        "next_cursor": next_cursor,
    })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Create session
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(post, path = "/api/sessions", tag = "sessions",
    request_body = CreateSessionRequest,
    responses((status = 201, description = "Session created")))]
pub async fn create_session(
    State(state): State<AppState>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    if req.title.len() > MAX_TITLE_LENGTH {
        tracing::warn!("create_session: title exceeds {} chars (got {})", MAX_TITLE_LENGTH, req.title.len());
        return Err(StatusCode::BAD_REQUEST);
    }

    let row = sqlx::query_as::<_, SessionRow>(
        "INSERT INTO ch_sessions (title) VALUES ($1) \
         RETURNING id, title, created_at, updated_at, working_directory",
    )
    .bind(&req.title)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let session = Session {
        id: row.id.to_string(),
        title: row.title,
        created_at: row.created_at.to_rfc3339(),
        messages: Vec::new(),
    };

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(session).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?),
    ))
}

// ═══════════════════════════════════════════════════════════════════════
//  Get session (with paginated messages + tool interactions)
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(get, path = "/api/sessions/{id}", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    responses((status = 200, description = "Session with messages")))]
pub async fn get_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;
    let msg_limit = params.limit.unwrap_or(200).clamp(1, 500);
    let msg_offset = params.offset.unwrap_or(0).max(0);

    let session_row = sqlx::query_as::<_, SessionRow>(
        "SELECT id, title, created_at, updated_at, working_directory FROM ch_sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let total_messages: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ch_messages WHERE session_id = $1",
    )
    .bind(session_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to count session messages: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let message_rows = sqlx::query_as::<_, MessageRow>(
        "SELECT * FROM (\
            SELECT id, session_id, role, content, model, agent, created_at \
            FROM ch_messages WHERE session_id = $1 \
            ORDER BY created_at DESC LIMIT $2 OFFSET $3\
        ) sub ORDER BY created_at ASC",
    )
    .bind(session_id)
    .bind(msg_limit)
    .bind(msg_offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get session messages: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let message_ids: Vec<uuid::Uuid> = message_rows.iter().map(|m| m.id).collect();
    let ti_rows = if message_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as::<_, ToolInteractionRow>(
            "SELECT ti.id, ti.message_id, ti.tool_use_id, ti.tool_name, \
             ti.tool_input, ti.result, ti.is_error, ti.executed_at \
             FROM ch_tool_interactions ti \
             WHERE ti.message_id = ANY($1) \
             ORDER BY ti.executed_at ASC",
        )
        .bind(&message_ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    };

    let mut ti_map: std::collections::HashMap<uuid::Uuid, Vec<ToolInteractionInfo>> =
        std::collections::HashMap::new();
    for ti in ti_rows {
        ti_map
            .entry(ti.message_id)
            .or_default()
            .push(ToolInteractionInfo {
                tool_use_id: ti.tool_use_id,
                tool_name: ti.tool_name,
                tool_input: ti.tool_input,
                result: ti.result,
                is_error: ti.is_error,
            });
    }

    let messages: Vec<HistoryEntry> = message_rows
        .into_iter()
        .map(|m| {
            let interactions = ti_map.remove(&m.id);
            HistoryEntry {
                id: m.id.to_string(),
                role: m.role,
                content: m.content,
                model: m.model,
                agent: m.agent,
                timestamp: m.created_at.to_rfc3339(),
                tool_interactions: interactions,
            }
        })
        .collect();

    Ok(Json(json!({
        "id": session_row.id.to_string(),
        "title": session_row.title,
        "created_at": session_row.created_at.to_rfc3339(),
        "working_directory": session_row.working_directory,
        "messages": serde_json::to_value(&messages).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        "pagination": {
            "total": total_messages,
            "limit": msg_limit,
            "offset": msg_offset,
        }
    })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Update session
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(patch, path = "/api/sessions/{id}", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    request_body = UpdateSessionRequest,
    responses((status = 200, description = "Updated session")))]
pub async fn update_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateSessionRequest>,
) -> Result<Json<Value>, StatusCode> {
    if req.title.len() > MAX_TITLE_LENGTH {
        tracing::warn!("update_session: title exceeds {} chars (got {})", MAX_TITLE_LENGTH, req.title.len());
        return Err(StatusCode::BAD_REQUEST);
    }

    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    let row = sqlx::query_as::<_, SessionRow>(
        "UPDATE ch_sessions SET title = $1, updated_at = NOW() WHERE id = $2 \
         RETURNING id, title, created_at, updated_at, working_directory",
    )
    .bind(&req.title)
    .bind(session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let session = SessionSummary {
        id: row.id.to_string(),
        title: row.title,
        created_at: row.created_at.to_rfc3339(),
        message_count: 0,
        working_directory: row.working_directory,
    };

    Ok(Json(serde_json::to_value(session).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?))
}

/// PATCH /api/sessions/{id}/working-directory
pub async fn update_session_working_directory(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateWorkingDirectoryRequest>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;
    let wd = req.working_directory.trim().to_string();

    if !wd.is_empty() && !std::path::Path::new(&wd).is_dir() {
        return Err(StatusCode::BAD_REQUEST);
    }

    sqlx::query("UPDATE ch_sessions SET working_directory = $1, updated_at = NOW() WHERE id = $2")
        .bind(&wd)
        .bind(session_id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({ "working_directory": wd })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Delete session
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(delete, path = "/api/sessions/{id}", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    responses((status = 200, description = "Session deleted")))]
pub async fn delete_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    let result = sqlx::query("DELETE FROM ch_sessions WHERE id = $1")
        .bind(session_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete session: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() > 0 {
        crate::audit::log_audit(
            &state.db,
            "delete_session",
            json!({ "session_id": id }),
            None,
        )
        .await;
    }

    Ok(Json(json!({ "status": "deleted", "id": id })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Add message to session
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(post, path = "/api/sessions/{id}/messages", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    request_body = AddMessageRequest,
    responses((status = 201, description = "Message added")))]
pub async fn add_session_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<AddMessageRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    if req.content.len() > MAX_MESSAGE_LENGTH {
        tracing::warn!("add_session_message: content exceeds {} chars (got {})", MAX_MESSAGE_LENGTH, req.content.len());
        return Err(StatusCode::BAD_REQUEST);
    }

    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    let exists = sqlx::query("SELECT 1 FROM ch_sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check session: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let row = sqlx::query_as::<_, MessageRow>(
        "INSERT INTO ch_messages (session_id, role, content, model, agent) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, session_id, role, content, model, agent, created_at",
    )
    .bind(session_id)
    .bind(&req.role)
    .bind(&req.content)
    .bind(&req.model)
    .bind(&req.agent)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to add message: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(ref interactions) = req.tool_interactions {
        for ti in interactions {
            sqlx::query(
                "INSERT INTO ch_tool_interactions \
                 (message_id, tool_use_id, tool_name, tool_input, result, is_error) \
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(row.id)
            .bind(&ti.tool_use_id)
            .bind(&ti.tool_name)
            .bind(&ti.tool_input)
            .bind(&ti.result)
            .bind(ti.is_error)
            .execute(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to save tool interaction: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
    }

    sqlx::query("UPDATE ch_sessions SET updated_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.db)
        .await
        .ok();

    let entry = HistoryEntry {
        id: row.id.to_string(),
        role: row.role,
        content: row.content,
        model: row.model,
        agent: row.agent,
        timestamp: row.created_at.to_rfc3339(),
        tool_interactions: req.tool_interactions,
    };

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(entry).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?),
    ))
}

// ═══════════════════════════════════════════════════════════════════════
//  Generate session title (AI-powered via Claude Haiku)
// ═══════════════════════════════════════════════════════════════════════

#[utoipa::path(post, path = "/api/sessions/{id}/generate-title", tag = "sessions",
    params(("id" = String, Path, description = "Session UUID")),
    responses((status = 200, description = "Generated title")))]
pub async fn generate_session_title(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let session_id: uuid::Uuid = id.parse().map_err(|_| StatusCode::BAD_REQUEST)?;

    let first_msg = sqlx::query_scalar::<_, String>(
        "SELECT content FROM ch_messages \
         WHERE session_id = $1 AND role = 'user' \
         ORDER BY created_at ASC LIMIT 1",
    )
    .bind(session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("generate_session_title: DB error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let snippet: &str = if first_msg.len() > 500 {
        let end = first_msg
            .char_indices()
            .take_while(|(i, _)| *i < 500)
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(500.min(first_msg.len()));
        &first_msg[..end]
    } else {
        &first_msg
    };

    let body = json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 64,
        "messages": [{
            "role": "user",
            "content": format!(
                "Generate a concise 3-7 word title for a chat that starts with this message. \
                 Return ONLY the title text, no quotes, no explanation.\n\nMessage: {}",
                snippet
            )
        }]
    });

    let resp = send_to_anthropic(&state, &body, 15).await.map_err(|e| {
        tracing::error!("generate_session_title: API error: {:?}", e.1);
        StatusCode::BAD_GATEWAY
    })?;

    if !resp.status().is_success() {
        tracing::error!("generate_session_title: API returned {}", resp.status());
        return Err(StatusCode::BAD_GATEWAY);
    }

    let json_resp: Value = resp.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    let raw_title = json_resp
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("");
    let raw_title = raw_title.trim().trim_matches('"').trim();

    if raw_title.is_empty() {
        tracing::warn!(
            "generate_session_title: Anthropic response missing text, response keys: {:?}",
            json_resp.as_object().map(|o| o.keys().collect::<Vec<_>>())
        );
        return Err(StatusCode::BAD_GATEWAY);
    }

    let title: String = raw_title.chars().take(MAX_TITLE_LENGTH).collect();

    sqlx::query("UPDATE ch_sessions SET title = $1, updated_at = NOW() WHERE id = $2")
        .bind(&title)
        .bind(session_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("generate_session_title: DB update failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    tracing::info!("generate_session_title: session {} → {:?}", session_id, title);
    Ok(Json(json!({ "title": title })))
}

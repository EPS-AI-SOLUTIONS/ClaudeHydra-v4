// Jaskier Shared Pattern — Vercel Tools
// Agent tools for Vercel API interactions.
// Reads token from ch_oauth_vercel table via oauth_vercel module.

use serde_json::{json, Value};

use crate::models::ToolDefinition;
use crate::oauth_vercel;
use crate::state::AppState;

const VERCEL_API_BASE: &str = "https://api.vercel.com";

// ═══════════════════════════════════════════════════════════════════════
//  Tool definitions
// ═══════════════════════════════════════════════════════════════════════

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "vercel_list_projects".to_string(),
            description: "List Vercel projects for the authenticated user/team. \
                Returns project names, frameworks, and latest deployments."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default: 20, max: 100)"
                    }
                },
                "required": []
            }),
        },
        ToolDefinition {
            name: "vercel_get_deployment".to_string(),
            description: "Get details about a specific Vercel deployment by ID or URL."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "deployment_id": {
                        "type": "string",
                        "description": "Deployment ID or URL"
                    }
                },
                "required": ["deployment_id"]
            }),
        },
        ToolDefinition {
            name: "vercel_deploy".to_string(),
            description: "Trigger a new deployment for a Vercel project. \
                Creates a deployment from the latest git commit."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name or ID"
                    },
                    "target": {
                        "type": "string",
                        "description": "Deployment target: production or preview (default: preview)"
                    }
                },
                "required": ["project"]
            }),
        },
    ]
}

// ═══════════════════════════════════════════════════════════════════════
//  Tool execution
// ═══════════════════════════════════════════════════════════════════════

pub async fn execute(
    tool_name: &str,
    input: &Value,
    state: &AppState,
) -> (String, bool) {
    let (token, team_id) = match oauth_vercel::get_vercel_access_token(state).await {
        Some(t) => t,
        None => {
            return (
                "Vercel not authenticated. Please connect your Vercel account via Settings > Vercel OAuth.".to_string(),
                true,
            )
        }
    };

    let client = &state.http_client;

    match tool_name {
        "vercel_list_projects" => exec_list_projects(client, &token, team_id.as_deref(), input).await,
        "vercel_get_deployment" => exec_get_deployment(client, &token, team_id.as_deref(), input).await,
        "vercel_deploy" => exec_deploy(client, &token, team_id.as_deref(), input).await,
        _ => (format!("Unknown Vercel tool: {}", tool_name), true),
    }
}

// ── Individual tool implementations ──────────────────────────────────────

async fn exec_list_projects(
    client: &reqwest::Client,
    token: &str,
    team_id: Option<&str>,
    input: &Value,
) -> (String, bool) {
    let limit = input
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20)
        .min(100);

    let mut url = format!("{}/v9/projects?limit={}", VERCEL_API_BASE, limit);
    if let Some(tid) = team_id {
        url.push_str(&format!("&teamId={}", tid));
    }

    match vercel_get(client, token, &url).await {
        Ok(body) => {
            let projects = body
                .get("projects")
                .and_then(|p| p.as_array())
                .map(|arr| {
                    arr.iter()
                        .map(|p| {
                            json!({
                                "name": p.get("name"),
                                "id": p.get("id"),
                                "framework": p.get("framework"),
                                "updated_at": p.get("updatedAt"),
                                "latest_deployments": p.get("latestDeployments").and_then(|d| d.as_array()).map(|arr| {
                                    arr.iter().take(1).map(|d| {
                                        json!({
                                            "id": d.get("id"),
                                            "state": d.get("state"),
                                            "url": d.get("url"),
                                            "created_at": d.get("createdAt"),
                                        })
                                    }).collect::<Vec<_>>()
                                }),
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            (
                serde_json::to_string_pretty(&projects).unwrap_or_else(|_| "[]".to_string()),
                false,
            )
        }
        Err(e) => (e, true),
    }
}

async fn exec_get_deployment(
    client: &reqwest::Client,
    token: &str,
    team_id: Option<&str>,
    input: &Value,
) -> (String, bool) {
    let deployment_id = input
        .get("deployment_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if deployment_id.is_empty() {
        return ("deployment_id is required".to_string(), true);
    }

    let mut url = format!("{}/v13/deployments/{}", VERCEL_API_BASE, deployment_id);
    if let Some(tid) = team_id {
        url.push_str(&format!("?teamId={}", tid));
    }

    match vercel_get(client, token, &url).await {
        Ok(body) => {
            let result = json!({
                "id": body.get("id"),
                "name": body.get("name"),
                "url": body.get("url"),
                "state": body.get("readyState"),
                "target": body.get("target"),
                "created_at": body.get("createdAt"),
                "ready": body.get("ready"),
                "build_errors": body.get("buildErrors"),
                "git_source": body.get("gitSource"),
            });
            (
                serde_json::to_string_pretty(&result).unwrap_or_else(|_| "{}".to_string()),
                false,
            )
        }
        Err(e) => (e, true),
    }
}

async fn exec_deploy(
    client: &reqwest::Client,
    token: &str,
    team_id: Option<&str>,
    input: &Value,
) -> (String, bool) {
    let project = input
        .get("project")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let target = input
        .get("target")
        .and_then(|v| v.as_str())
        .unwrap_or("preview");

    if project.is_empty() {
        return ("project is required".to_string(), true);
    }

    let mut url = format!("{}/v13/deployments", VERCEL_API_BASE);
    if let Some(tid) = team_id {
        url.push_str(&format!("?teamId={}", tid));
    }

    let body = json!({
        "name": project,
        "target": target,
    });

    match vercel_post(client, token, &url, &body).await {
        Ok(resp) => {
            let result = json!({
                "id": resp.get("id"),
                "url": resp.get("url"),
                "state": resp.get("readyState"),
                "target": resp.get("target"),
                "created_at": resp.get("createdAt"),
            });
            (
                serde_json::to_string_pretty(&result).unwrap_or_else(|_| "{}".to_string()),
                false,
            )
        }
        Err(e) => (e, true),
    }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────

async fn vercel_get(
    client: &reqwest::Client,
    token: &str,
    url: &str,
) -> Result<Value, String> {
    let resp = client
        .get(url)
        .header("authorization", format!("Bearer {}", token))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Vercel API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Vercel API error {}: {}", status, body));
    }

    resp.json::<Value>()
        .await
        .map_err(|e| format!("Failed to parse Vercel response: {}", e))
}

async fn vercel_post(
    client: &reqwest::Client,
    token: &str,
    url: &str,
    body: &Value,
) -> Result<Value, String> {
    let resp = client
        .post(url)
        .header("authorization", format!("Bearer {}", token))
        .json(body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Vercel API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Vercel API error {}: {}", status, body));
    }

    resp.json::<Value>()
        .await
        .map_err(|e| format!("Failed to parse Vercel response: {}", e))
}

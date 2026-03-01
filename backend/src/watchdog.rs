// Jaskier Shared Pattern — watchdog
// ClaudeHydra v4 — Background watchdog
//
// Periodically checks backend health and performs auto-recovery:
// - DB connectivity ping (SELECT 1)
// - Model cache staleness check + auto-refresh
// - Logs health status for external monitoring

use std::time::Duration;

use crate::model_registry;
use crate::state::AppState;

const CHECK_INTERVAL: Duration = Duration::from_secs(60);
const DB_PING_TIMEOUT: Duration = Duration::from_secs(5);

pub fn spawn(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("watchdog: started (interval={}s)", CHECK_INTERVAL.as_secs());

        loop {
            tokio::time::sleep(CHECK_INTERVAL).await;

            let db_ok = check_db(&state).await;
            let cache_ok = check_and_refresh_cache(&state).await;
            let api_ok = check_anthropic_api(&state).await;

            if db_ok && cache_ok && api_ok {
                tracing::debug!("watchdog: all checks passed");
            } else {
                tracing::warn!(
                    "watchdog: db={} cache={} api={}",
                    if db_ok { "ok" } else { "FAIL" },
                    if cache_ok { "ok" } else { "REFRESHED" },
                    if api_ok { "ok" } else { "UNREACHABLE" },
                );
            }
        }
    })
}

async fn check_db(state: &AppState) -> bool {
    let result = tokio::time::timeout(
        DB_PING_TIMEOUT,
        sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.db),
    )
    .await;

    match result {
        Ok(Ok(_)) => true,
        Ok(Err(e)) => {
            tracing::error!("watchdog: DB ping failed: {}", e);
            false
        }
        Err(_) => {
            tracing::error!("watchdog: DB ping timed out after {}s", DB_PING_TIMEOUT.as_secs());
            false
        }
    }
}

async fn check_and_refresh_cache(state: &AppState) -> bool {
    let is_stale = {
        let lock_result = tokio::time::timeout(
            Duration::from_secs(5),
            state.model_cache.read(),
        )
        .await;

        match lock_result {
            Ok(cache) => cache.is_stale(),
            Err(_) => {
                tracing::error!("watchdog: model_cache read lock timed out — possible deadlock");
                return false;
            }
        }
    };

    if is_stale {
        tracing::info!("watchdog: model cache stale, triggering refresh");
        let refresh_result = tokio::time::timeout(
            Duration::from_secs(30),
            model_registry::refresh_cache(state),
        )
        .await;

        match refresh_result {
            Ok((models, errors)) => {
                let total: usize = models.values().map(|v| v.len()).sum();
                tracing::info!("watchdog: cache refreshed — {} models from {} providers", total, models.len());
                for err in &errors {
                    tracing::warn!("watchdog: provider fetch error: {}", err);
                }
            }
            Err(_) => {
                tracing::error!("watchdog: cache refresh timed out after 30s");
            }
        }
        false
    } else {
        true
    }
}

/// Check Anthropic API reachability.
/// Uses a lightweight HEAD request to api.anthropic.com (no tokens consumed).
/// Skips if no credential is available (OAuth token or API key).
async fn check_anthropic_api(state: &AppState) -> bool {
    // Only check if we have a credential configured
    let has_oauth = crate::oauth::get_valid_access_token(state).await.is_some();
    let has_key = {
        let rt = state.runtime.read().await;
        rt.api_keys.contains_key("ANTHROPIC_API_KEY")
    };

    if !has_oauth && !has_key {
        // No credential — skip check (not an error)
        return true;
    }

    let result = tokio::time::timeout(
        Duration::from_secs(5),
        state
            .http_client
            .head("https://api.anthropic.com/v1/messages")
            .header("anthropic-version", "2023-06-01")
            .send(),
    )
    .await;

    match result {
        Ok(Ok(resp)) => {
            // Any HTTP response (even 401/405) means the host is reachable
            let status = resp.status().as_u16();
            if status >= 500 {
                tracing::warn!("watchdog: Anthropic API returned server error {}", status);
                false
            } else {
                true
            }
        }
        Ok(Err(e)) => {
            tracing::error!("watchdog: Anthropic API unreachable: {}", e);
            false
        }
        Err(_) => {
            tracing::error!("watchdog: Anthropic API check timed out after 5s");
            false
        }
    }
}

// Jaskier Shared Pattern -- auth
// Optional Bearer token authentication middleware.
// If AUTH_SECRET env is set, all protected routes require
// `Authorization: Bearer <secret>`. If not set, auth is disabled (dev mode).

use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};

use crate::state::AppState;

/// Middleware that enforces Bearer token auth when AUTH_SECRET is configured.
/// Public routes (health, readiness, auth/*) should NOT use this middleware.
pub async fn require_auth(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let secret = match state.auth_secret.as_deref() {
        Some(s) => s,
        None => return Ok(next.run(request).await), // Dev mode — no auth required
    };

    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let token = &header[7..];
            if token == secret {
                Ok(next.run(request).await)
            } else {
                tracing::warn!("Auth failed: invalid token");
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => {
            tracing::warn!("Auth failed: missing or malformed Authorization header");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

/// Pure function: extract and validate a Bearer token from an Authorization header value.
/// Returns true if the token matches the expected secret.
/// Used internally by `require_auth` middleware.
pub fn check_bearer_token(header_value: Option<&str>, expected_secret: &str) -> bool {
    match header_value {
        Some(header) if header.starts_with("Bearer ") => &header[7..] == expected_secret,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── check_bearer_token ───────────────────────────────────────────────

    #[test]
    fn bearer_valid_token() {
        assert!(check_bearer_token(Some("Bearer mysecret"), "mysecret"));
    }

    #[test]
    fn bearer_wrong_token() {
        assert!(!check_bearer_token(Some("Bearer wrong"), "mysecret"));
    }

    #[test]
    fn bearer_missing_header() {
        assert!(!check_bearer_token(None, "mysecret"));
    }

    #[test]
    fn bearer_malformed_no_prefix() {
        assert!(!check_bearer_token(Some("mysecret"), "mysecret"));
    }

    #[test]
    fn bearer_basic_auth_rejected() {
        assert!(!check_bearer_token(Some("Basic not-a-bearer-token"), "mysecret"));
    }

    #[test]
    fn bearer_empty_token() {
        assert!(!check_bearer_token(Some("Bearer "), "mysecret"));
    }

    #[test]
    fn bearer_extra_spaces_rejected() {
        assert!(!check_bearer_token(Some("Bearer  mysecret"), "mysecret"));
    }

    #[test]
    fn bearer_case_sensitive() {
        assert!(!check_bearer_token(Some("bearer mysecret"), "mysecret"));
    }
}

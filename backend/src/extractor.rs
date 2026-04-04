//! Axum extractor for ClaudeHydra JWT authentication (jaskier-auth).
//!
//! Provides [`RequireAuth`] — an Axum extractor that validates a
//! `jaskier_access_token` JWT from the `Authorization: Bearer` header,
//! the `jaskier_access_token` cookie, or a `?token=` query parameter.
//!
//! This wraps the shared [`jaskier_auth::validate_token`] function so
//! handler signatures can simply include `RequireAuth` to enforce
//! user authentication.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use tracing::{debug, warn};

use crate::state::AppState;

/// Axum extractor that rejects with 401 if no valid jaskier-auth JWT is present.
///
/// # Usage
///
/// ```rust,ignore
/// async fn protected_handler(auth: RequireAuth) -> impl IntoResponse {
///     Json(json!({"email": auth.email}))
/// }
/// ```
pub struct RequireAuth {
    /// Authenticated user's email address.
    pub email: String,
    /// Authenticated user's display name (if set).
    pub name: Option<String>,
}

impl FromRequestParts<AppState> for RequireAuth {
    type Rejection = (StatusCode, String);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jwt_secret = state.base.auth_secret.as_deref().ok_or_else(|| {
            warn!("AUTH_SECRET not configured");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Server authentication not configured".to_string(),
            )
        })?;

        let token = extract_token(parts).ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Missing authentication token".to_string(),
            )
        })?;

        let user = jaskier_auth::validate_token(&token, jwt_secret.as_bytes()).map_err(|e| {
            warn!(error = %e, "JWT validation failed");
            (
                StatusCode::UNAUTHORIZED,
                "Invalid or expired authentication token".to_string(),
            )
        })?;

        debug!(email = %user.email, "Authenticated via jaskier-auth");
        Ok(RequireAuth {
            email: user.email,
            name: user.name,
        })
    }
}

/// Extract a JWT token from the request (header, cookie, or query parameter).
fn extract_token(parts: &Parts) -> Option<String> {
    // 1. Try Authorization: Bearer header
    if let Some(auth_header) = parts
        .headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        && let Some(token) = auth_header.strip_prefix("Bearer ")
    {
        return Some(token.to_string());
    }

    // 2. Try jaskier_access_token cookie
    if let Some(cookie_header) = parts.headers.get("cookie").and_then(|v| v.to_str().ok()) {
        for pair in cookie_header.split(';') {
            let pair = pair.trim();
            if let Some(value) = pair.strip_prefix("jaskier_access_token=")
                && !value.is_empty()
            {
                return Some(value.to_string());
            }
        }
    }

    // 3. Try ?token= query parameter
    if let Some(query) = parts.uri.query() {
        for param in query.split('&') {
            if let Some((k, v)) = param.split_once('=')
                && k == "token"
            {
                return Some(v.to_string());
            }
        }
    }

    None
}

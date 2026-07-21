use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

use super::jwt::{validate_token, Claims};

/// Authenticated user extractor.
///
/// Implements `FromRequestParts` so it can be used as a handler argument.
/// Extracts and validates the JWT from the `Authorization: Bearer <token>` header.
///
/// # Example
/// ```rust
/// async fn handler(auth: AuthUser) -> impl IntoResponse {
///     format!("Hello, user {}", auth.user_id)
/// }
/// ```
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    #[allow(dead_code)]
    pub claims: Claims,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // Extract the Authorization header
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

        // Expect "Bearer <token>" format
        let token = auth_header.strip_prefix("Bearer ").ok_or_else(|| {
            AppError::Unauthorized(
                "Invalid Authorization header format, expected 'Bearer <token>'".into(),
            )
        })?;

        // Validate the JWT
        let claims = validate_token(token, &state.config.jwt_secret)?;

        // Only accept access tokens (not refresh tokens)
        if claims.token_type != "access" {
            return Err(AppError::Unauthorized(
                "Expected access token, got refresh token".into(),
            ));
        }

        Ok(AuthUser {
            user_id: claims.sub,
            claims,
        })
    }
}

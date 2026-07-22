use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

/// JWT claims payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject — the user's UUID.
    pub sub: Uuid,
    /// Expiration time (Unix timestamp).
    pub exp: i64,
    /// Issued-at time (Unix timestamp).
    pub iat: i64,
    /// Token type: `"access"` or `"refresh"`.
    pub token_type: String,
}

/// Create a short-lived access token (default: 15 minutes).
pub fn create_access_token(user_id: Uuid, secret: &str, ttl_secs: i64) -> AppResult<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id,
        iat: now.timestamp(),
        exp: (now + Duration::seconds(ttl_secs)).timestamp(),
        token_type: "access".to_string(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encoding failed: {}", e)))
}

/// Create a long-lived refresh token (default: 7 days).
pub fn create_refresh_token(user_id: Uuid, secret: &str, ttl_secs: i64) -> AppResult<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id,
        iat: now.timestamp(),
        exp: (now + Duration::seconds(ttl_secs)).timestamp(),
        token_type: "refresh".to_string(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encoding failed: {}", e)))
}

/// Validate a JWT and extract its claims.
///
/// Returns `Unauthorized` for expired or malformed tokens.
pub fn validate_token(token: &str, secret: &str) -> AppResult<Claims> {
    let mut validation = Validation::default();
    validation.validate_exp = true;

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => {
            AppError::Unauthorized("Token expired".into())
        }
        _ => AppError::Unauthorized(format!("Invalid token: {}", e)),
    })
}

/// Hash a refresh token using SHA-256 for secure storage.
///
/// We store the hash (not the raw token) in the database so that
/// even if the DB is compromised, tokens cannot be replayed.
pub fn hash_token(token: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_access_and_refresh_tokens() {
        let secret = "test_secret_key_1234567890_salotto_key";
        let user_id = Uuid::now_v7();

        // 1. Create access token
        let access_token = create_access_token(user_id, secret, 900).unwrap();
        let claims = validate_token(&access_token, secret).unwrap();

        assert_eq!(claims.sub, user_id);
        assert_eq!(claims.token_type, "access");

        // 2. Create refresh token
        let refresh_token = create_refresh_token(user_id, secret, 604800).unwrap();
        let refresh_claims = validate_token(&refresh_token, secret).unwrap();

        assert_eq!(refresh_claims.sub, user_id);
        assert_eq!(refresh_claims.token_type, "refresh");

        // 3. Test SHA-256 token hashing
        let token_hash = hash_token(&refresh_token);
        assert!(!token_hash.is_empty());
        assert_eq!(token_hash.len(), 64);
    }
}

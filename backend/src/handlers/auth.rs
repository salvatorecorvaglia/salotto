use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, Utc};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::{
        jwt::{create_access_token, create_refresh_token, hash_token, validate_token},
        password::{hash_password, verify_password},
    },
    error::{AppError, AppResult},
    models::user::{
        AuthResponse, LoginPayload, RefreshPayload, RegisterPayload, User, UserProfile,
    },
    state::AppState,
};

/// POST /api/v1/auth/register
///
/// Creates a new user account, hashes the password with Argon2id,
/// and returns access + refresh tokens.
pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterPayload>,
) -> AppResult<(StatusCode, Json<AuthResponse>)> {
    // Validate input
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Hash the password (runs on blocking thread)
    let password_hash = hash_password(payload.password).await?;

    // Generate a UUIDv7 (time-ordered)
    let user_id = Uuid::now_v7();
    let display_name = payload
        .display_name
        .unwrap_or_else(|| payload.username.clone());

    // Insert the user
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (id, username, email, display_name, password_hash)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(&payload.username)
    .bind(&payload.email)
    .bind(&display_name)
    .bind(&password_hash)
    .fetch_one(&state.db)
    .await?;

    // Generate tokens
    let access_token = create_access_token(
        user.id,
        &state.config.jwt_secret,
        state.config.jwt_access_ttl_secs,
    )?;
    let refresh_token = create_refresh_token(
        user.id,
        &state.config.jwt_secret,
        state.config.jwt_refresh_ttl_secs,
    )?;

    // Store refresh token hash in the database
    store_refresh_token(&state, user.id, &refresh_token).await?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            access_token,
            refresh_token,
            user: UserProfile::from(user),
        }),
    ))
}

/// POST /api/v1/auth/login
///
/// Authenticates a user by email + password and returns tokens.
pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginPayload>,
) -> AppResult<Json<AuthResponse>> {
    // Find user by email
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(&payload.email)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Unauthorized("Invalid email or password".into()))?;

    // Verify password
    let valid = verify_password(payload.password, user.password_hash.clone()).await?;
    if !valid {
        return Err(AppError::Unauthorized("Invalid email or password".into()));
    }

    // Update last_seen_at
    sqlx::query("UPDATE users SET last_seen_at = NOW(), status = 'online' WHERE id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    // Generate tokens
    let access_token = create_access_token(
        user.id,
        &state.config.jwt_secret,
        state.config.jwt_access_ttl_secs,
    )?;
    let refresh_token = create_refresh_token(
        user.id,
        &state.config.jwt_secret,
        state.config.jwt_refresh_ttl_secs,
    )?;

    // Store refresh token hash
    store_refresh_token(&state, user.id, &refresh_token).await?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        user: UserProfile::from(user),
    }))
}

/// POST /api/v1/auth/refresh
///
/// Exchanges a valid refresh token for a new token pair.
/// Implements token rotation: the old refresh token is revoked.
pub async fn refresh(
    State(state): State<AppState>,
    Json(payload): Json<RefreshPayload>,
) -> AppResult<Json<AuthResponse>> {
    // Validate the refresh JWT
    let claims = validate_token(&payload.refresh_token, &state.config.jwt_secret)?;
    if claims.token_type != "refresh" {
        return Err(AppError::Unauthorized("Expected refresh token".into()));
    }

    // Look up the token hash in the database
    let token_hash = hash_token(&payload.refresh_token);
    let stored = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()",
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Refresh token not found or expired".into()))?;

    // Revoke the old token (rotation)
    sqlx::query("DELETE FROM refresh_tokens WHERE id = $1")
        .bind(stored)
        .execute(&state.db)
        .await?;

    // Fetch user
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;

    // Issue new tokens
    let access_token = create_access_token(
        user.id,
        &state.config.jwt_secret,
        state.config.jwt_access_ttl_secs,
    )?;
    let new_refresh_token = create_refresh_token(
        user.id,
        &state.config.jwt_secret,
        state.config.jwt_refresh_ttl_secs,
    )?;

    store_refresh_token(&state, user.id, &new_refresh_token).await?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token: new_refresh_token,
        user: UserProfile::from(user),
    }))
}

/// POST /api/v1/auth/logout
///
/// Revokes all refresh tokens for the authenticated user.
pub async fn logout(
    State(state): State<AppState>,
    Json(payload): Json<RefreshPayload>,
) -> AppResult<StatusCode> {
    // Validate the refresh token to get the user ID
    let claims = validate_token(&payload.refresh_token, &state.config.jwt_secret).ok();

    if let Some(claims) = claims {
        // Delete the specific refresh token
        let token_hash = hash_token(&payload.refresh_token);
        sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2")
            .bind(&token_hash)
            .bind(claims.sub)
            .execute(&state.db)
            .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Helpers ──

/// Store a SHA-256 hash of the refresh token in the database.
async fn store_refresh_token(state: &AppState, user_id: Uuid, raw_token: &str) -> AppResult<()> {
    let token_id = Uuid::now_v7();
    let token_hash = hash_token(raw_token);
    let expires_at = Utc::now() + Duration::seconds(state.config.jwt_refresh_ttl_secs);

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(token_id)
    .bind(user_id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok(())
}

use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    models::user::{UpdateProfilePayload, User, UserProfile},
    state::AppState,
};

/// GET /api/v1/users/me
///
/// Returns the authenticated user's full profile (including email).
pub async fn get_me(auth: AuthUser, State(state): State<AppState>) -> AppResult<Json<User>> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(auth.user_id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(user))
}

/// PATCH /api/v1/users/me
///
/// Updates the authenticated user's profile fields.
pub async fn update_me(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(payload): Json<UpdateProfilePayload>,
) -> AppResult<Json<User>> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let user = sqlx::query_as::<_, User>(
        r#"
        UPDATE users
        SET
            display_name = COALESCE($2, display_name),
            avatar_url   = COALESCE($3, avatar_url),
            custom_status_emoji = CASE 
                WHEN $4 IS NOT NULL THEN (CASE WHEN $4 = '' THEN NULL ELSE $4 END)
                ELSE custom_status_emoji 
            END,
            custom_status_text = CASE 
                WHEN $5 IS NOT NULL THEN (CASE WHEN $5 = '' THEN NULL ELSE $5 END)
                ELSE custom_status_text 
            END,
            updated_at   = NOW()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(auth.user_id)
    .bind(&payload.display_name)
    .bind(&payload.avatar_url)
    .bind(&payload.custom_status_emoji)
    .bind(&payload.custom_status_text)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(user))
}

/// GET /api/v1/users/:user_id
///
/// Returns a public profile for any user (no email, no password hash).
pub async fn get_user(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> AppResult<Json<UserProfile>> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    Ok(Json(UserProfile::from(user)))
}

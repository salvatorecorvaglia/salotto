use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    models::channel::{Channel, ChannelKind, CreateChannelPayload, UpdateChannelPayload},
    state::AppState,
};

use super::workspaces::require_workspace_member;

/// POST /api/v1/workspaces/:workspace_id/channels
///
/// Creates a new channel in the workspace.
pub async fn create(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    Json(payload): Json<CreateChannelPayload>,
) -> AppResult<(StatusCode, Json<Channel>)> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Verify workspace membership
    require_workspace_member(&state, workspace_id, auth.user_id).await?;

    // Validate channel kind
    let kind = payload.kind.as_deref().unwrap_or("text");
    if ChannelKind::from_str(kind).is_none() {
        return Err(AppError::BadRequest(format!(
            "Invalid channel kind: '{}'. Must be one of: text, voice, announcement",
            kind
        )));
    }

    let channel_id = Uuid::now_v7();
    let is_private = payload.is_private.unwrap_or(false);

    let channel = sqlx::query_as::<_, Channel>(
        r#"
        INSERT INTO channels (id, workspace_id, name, kind, topic, is_private, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        "#,
    )
    .bind(channel_id)
    .bind(workspace_id)
    .bind(&payload.name)
    .bind(kind)
    .bind(&payload.topic)
    .bind(is_private)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    // Auto-join the creator
    sqlx::query(
        "INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)",
    )
    .bind(channel_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    // If the channel is public, auto-join all workspace members
    if !is_private {
        sqlx::query(
            r#"
            INSERT INTO channel_members (channel_id, user_id)
            SELECT $1, user_id FROM workspace_members WHERE workspace_id = $2
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(channel_id)
        .bind(workspace_id)
        .execute(&state.db)
        .await?;
    }

    Ok((StatusCode::CREATED, Json(channel)))
}

/// GET /api/v1/workspaces/:workspace_id/channels
///
/// Lists all channels in a workspace that the user can see.
/// Public channels are always visible; private channels only if the user is a member.
pub async fn list_for_workspace(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
) -> AppResult<Json<Vec<Channel>>> {
    // Verify workspace membership
    require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let channels = sqlx::query_as::<_, Channel>(
        r#"
        SELECT c.*
        FROM channels c
        WHERE c.workspace_id = $1
        AND (
            c.is_private = FALSE
            OR EXISTS (
                SELECT 1 FROM channel_members cm
                WHERE cm.channel_id = c.id AND cm.user_id = $2
            )
        )
        ORDER BY c.created_at ASC
        "#,
    )
    .bind(workspace_id)
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(channels))
}

/// GET /api/v1/channels/:channel_id
///
/// Returns a single channel. Requires membership for private channels.
pub async fn get_by_id(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
) -> AppResult<Json<Channel>> {
    let channel = sqlx::query_as::<_, Channel>(
        "SELECT * FROM channels WHERE id = $1",
    )
    .bind(channel_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;

    // Verify workspace membership
    require_workspace_member(&state, channel.workspace_id, auth.user_id).await?;

    // For private channels, verify channel membership
    if channel.is_private {
        let is_member = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2)",
        )
        .bind(channel_id)
        .bind(auth.user_id)
        .fetch_one(&state.db)
        .await?;

        if !is_member {
            return Err(AppError::Forbidden(
                "Not a member of this private channel".into(),
            ));
        }
    }

    Ok(Json(channel))
}

/// PATCH /api/v1/channels/:channel_id
///
/// Updates a channel's name, topic, or privacy setting.
pub async fn update(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<UpdateChannelPayload>,
) -> AppResult<Json<Channel>> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let channel = sqlx::query_as::<_, Channel>(
        "SELECT * FROM channels WHERE id = $1",
    )
    .bind(channel_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;

    // Verify workspace membership (admin check could be added here)
    require_workspace_member(&state, channel.workspace_id, auth.user_id).await?;

    let updated = sqlx::query_as::<_, Channel>(
        r#"
        UPDATE channels
        SET
            name       = COALESCE($2, name),
            topic      = COALESCE($3, topic),
            is_private = COALESCE($4, is_private)
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(channel_id)
    .bind(&payload.name)
    .bind(&payload.topic)
    .bind(payload.is_private)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(updated))
}

/// POST /api/v1/channels/:channel_id/join
///
/// Joins the authenticated user to a channel.
pub async fn join(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let channel = sqlx::query_as::<_, Channel>(
        "SELECT * FROM channels WHERE id = $1",
    )
    .bind(channel_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;

    // Must be a workspace member
    require_workspace_member(&state, channel.workspace_id, auth.user_id).await?;

    // Cannot self-join a private channel (must be invited)
    if channel.is_private {
        return Err(AppError::Forbidden(
            "Cannot join a private channel without an invitation".into(),
        ));
    }

    sqlx::query(
        r#"
        INSERT INTO channel_members (channel_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(channel_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/channels/:channel_id/leave
///
/// Removes the authenticated user from a channel.
pub async fn leave(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    sqlx::query(
        "DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2",
    )
    .bind(channel_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/channels/{channel_id}
///
/// Deletes a channel. Requires admin/owner role in the workspace.
pub async fn delete_channel(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let channel = sqlx::query_as::<_, Channel>(
        "SELECT * FROM channels WHERE id = $1",
    )
    .bind(channel_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;

    // Check workspace role: must be admin or owner
    let role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2"
    )
    .bind(channel.workspace_id)
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Forbidden("Not a member of this workspace".into()))?;

    if role != "admin" && role != "owner" {
        return Err(AppError::Forbidden("Only workspace admins or owners can delete channels".into()));
    }

    // Cascade delete is handled by database foreign key constraints!
    sqlx::query("DELETE FROM channels WHERE id = $1")
        .bind(channel_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

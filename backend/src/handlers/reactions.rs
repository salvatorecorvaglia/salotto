use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct ReactionPayload {
    pub emoji: String,
}

/// POST /api/v1/messages/{message_id}/reactions
///
/// Toggle/add an emoji reaction to a message.
pub async fn add_reaction(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(message_id): Path<Uuid>,
    Json(payload): Json<ReactionPayload>,
) -> AppResult<StatusCode> {
    // 1. Fetch message context and find the workspace it belongs to (either channel or DM)
    let (workspace_id, _, _) = sqlx::query_as::<_, (Uuid, Option<Uuid>, Option<Uuid>)>(
        r#"
        SELECT 
            COALESCE(c.workspace_id, dc.workspace_id) as workspace_id,
            m.channel_id,
            m.conversation_id
        FROM messages m
        LEFT JOIN channels c ON c.id = m.channel_id
        LEFT JOIN direct_conversations dc ON dc.id = m.conversation_id
        WHERE m.id = $1
        "#,
    )
    .bind(message_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Message not found".into()))?;

    // 2. Verify requester is member of this workspace
    super::workspaces::require_workspace_member(&state, workspace_id, auth.user_id).await?;

    // 3. Insert reaction
    sqlx::query(
        r#"
        INSERT INTO message_reactions (message_id, user_id, emoji)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id, emoji) DO NOTHING
        "#,
    )
    .bind(message_id)
    .bind(auth.user_id)
    .bind(&payload.emoji)
    .execute(&state.db)
    .await?;

    // 4. Broadcast the event to all users in the workspace
    let event = crate::ws::handler::WsServerMessage::ReactionAdded {
        message_id,
        user_id: auth.user_id,
        emoji: payload.emoji.clone(),
    };
    let _ = crate::ws::pubsub::publish_event(&state.redis, workspace_id, &event).await;

    Ok(StatusCode::CREATED)
}

/// DELETE /api/v1/messages/{message_id}/reactions/{emoji}
///
/// Remove an emoji reaction from a message.
pub async fn remove_reaction(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((message_id, emoji)): Path<(Uuid, String)>,
) -> AppResult<StatusCode> {
    // 1. Fetch message context
    let (workspace_id, _, _) = sqlx::query_as::<_, (Uuid, Option<Uuid>, Option<Uuid>)>(
        r#"
        SELECT 
            COALESCE(c.workspace_id, dc.workspace_id) as workspace_id,
            m.channel_id,
            m.conversation_id
        FROM messages m
        LEFT JOIN channels c ON c.id = m.channel_id
        LEFT JOIN direct_conversations dc ON dc.id = m.conversation_id
        WHERE m.id = $1
        "#,
    )
    .bind(message_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Message not found".into()))?;

    // 2. Verify requester membership
    super::workspaces::require_workspace_member(&state, workspace_id, auth.user_id).await?;

    // 3. Delete the reaction
    let rows_affected = sqlx::query(
        "DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3",
    )
    .bind(message_id)
    .bind(auth.user_id)
    .bind(&emoji)
    .execute(&state.db)
    .await?
    .rows_affected();

    if rows_affected > 0 {
        // 4. Broadcast removal
        let event = crate::ws::handler::WsServerMessage::ReactionRemoved {
            message_id,
            user_id: auth.user_id,
            emoji: emoji.clone(),
        };
        let _ = crate::ws::pubsub::publish_event(&state.redis, workspace_id, &event).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

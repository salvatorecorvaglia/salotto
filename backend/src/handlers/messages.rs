use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    models::message::{
        EditMessagePayload, ListMessagesQuery, Message, MessagePage, SendMessagePayload,
    },
    state::AppState,
};

/// POST /api/v1/channels/:channel_id/messages
///
/// Sends a new message to a channel. Requires channel membership.
pub async fn send(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<SendMessagePayload>,
) -> AppResult<(StatusCode, Json<Message>)> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Verify the user is a member of this channel
    require_channel_member(&state, channel_id, auth.user_id).await?;

    // If a parent_id is provided, verify the parent exists in the same channel
    if let Some(parent_id) = payload.parent_id {
        let parent_exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1 AND channel_id = $2)",
        )
        .bind(parent_id)
        .bind(channel_id)
        .fetch_one(&state.db)
        .await?;

        if !parent_exists {
            return Err(AppError::NotFound(
                "Parent message not found in this channel".into(),
            ));
        }
    }

    let message_id = Uuid::now_v7();
    let attachments = payload
        .attachments
        .map(|a| serde_json::to_value(a).unwrap_or_default())
        .unwrap_or_else(|| serde_json::json!([]));

    let message = sqlx::query_as::<_, Message>(
        r#"
        INSERT INTO messages (id, channel_id, sender_id, parent_id, content, attachments)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *, '[]'::json as reactions
        "#,
    )
    .bind(message_id)
    .bind(channel_id)
    .bind(auth.user_id)
    .bind(payload.parent_id)
    .bind(&payload.content)
    .bind(&attachments)
    .fetch_one(&state.db)
    .await?;

    // Broadcast via WebSocket / Redis pub-sub
    if let Ok(workspace_id) =
        sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM channels WHERE id = $1")
            .bind(channel_id)
            .fetch_one(&state.db)
            .await
    {
        let event = crate::ws::handler::WsServerMessage::NewMessage {
            channel_id,
            message_id: message.id,
            sender_id: message.sender_id,
            content: message.content.clone(),
        };
        let _ = crate::ws::pubsub::publish_event(&state.redis, workspace_id, &event).await;
    }

    Ok((StatusCode::CREATED, Json(message)))
}

/// GET /api/v1/channels/:channel_id/messages
///
/// Lists messages in a channel with cursor-based pagination.
///
/// Query params:
/// - `before` (optional): UUIDv7 cursor — fetch messages with `id < before`
/// - `limit` (optional): page size (default 50, max 100)
///
/// Since UUIDv7 is time-ordered, `id < before` gives us chronological ordering
/// without needing a separate created_at cursor.
pub async fn list(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
    Query(query): Query<ListMessagesQuery>,
) -> AppResult<Json<MessagePage>> {
    // Verify channel membership
    require_channel_member(&state, channel_id, auth.user_id).await?;

    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    // Fetch one extra to determine if there are more pages
    let fetch_limit = limit + 1;

    let mut messages = if let Some(before) = query.before {
        sqlx::query_as::<_, Message>(
            r#"
            SELECT m.*,
                   COALESCE(
                       (SELECT json_agg(json_build_object('emoji', mr.emoji, 'user_id', mr.user_id)) 
                        FROM message_reactions mr 
                        WHERE mr.message_id = m.id), 
                       '[]'::json
                   ) as reactions
            FROM messages m
            WHERE m.channel_id = $1 AND m.id < $2
            ORDER BY m.id DESC
            LIMIT $3
            "#,
        )
        .bind(channel_id)
        .bind(before)
        .bind(fetch_limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, Message>(
            r#"
            SELECT m.*,
                   COALESCE(
                       (SELECT json_agg(json_build_object('emoji', mr.emoji, 'user_id', mr.user_id)) 
                        FROM message_reactions mr 
                        WHERE mr.message_id = m.id), 
                       '[]'::json
                   ) as reactions
            FROM messages m
            WHERE m.channel_id = $1
            ORDER BY m.id DESC
            LIMIT $2
            "#,
        )
        .bind(channel_id)
        .bind(fetch_limit)
        .fetch_all(&state.db)
        .await?
    };

    let has_more = messages.len() as i64 > limit;
    if has_more {
        messages.pop(); // Remove the extra item
    }

    // Update last_read_at for this user
    sqlx::query(
        "UPDATE channel_members SET last_read_at = NOW() WHERE channel_id = $1 AND user_id = $2",
    )
    .bind(channel_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    Ok(Json(MessagePage { messages, has_more }))
}

/// PATCH /api/v1/messages/:message_id
///
/// Edits a message. Only the original sender can edit.
pub async fn edit(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(message_id): Path<Uuid>,
    Json(payload): Json<EditMessagePayload>,
) -> AppResult<Json<Message>> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Fetch the message and verify ownership
    let existing = sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = $1")
        .bind(message_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".into()))?;

    if existing.sender_id != auth.user_id {
        return Err(AppError::Forbidden(
            "You can only edit your own messages".into(),
        ));
    }

    let message = sqlx::query_as::<_, Message>(
        r#"
        WITH updated AS (
            UPDATE messages
            SET content = $2, is_edited = TRUE, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        )
        SELECT u.*,
               COALESCE(
                   (SELECT json_agg(json_build_object('emoji', mr.emoji, 'user_id', mr.user_id))
                    FROM message_reactions mr
                    WHERE mr.message_id = u.id),
                   '[]'::json
               ) as reactions
        FROM updated u
        "#,
    )
    .bind(message_id)
    .bind(&payload.content)
    .fetch_one(&state.db)
    .await?;

    // Broadcast edit event via WebSocket
    if let Ok(workspace_id) =
        sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM channels WHERE id = $1")
            .bind(message.channel_id.unwrap_or_default())
            .fetch_one(&state.db)
            .await
    {
        let event = crate::ws::handler::WsServerMessage::MessageEdited {
            channel_id: message.channel_id.unwrap_or_default(),
            message_id: message.id,
            content: message.content.clone(),
        };
        let _ = crate::ws::pubsub::publish_event(&state.redis, workspace_id, &event).await;
    }

    Ok(Json(message))
}

/// DELETE /api/v1/messages/:message_id
///
/// Deletes a message. Only the original sender or a workspace admin can delete.
pub async fn delete_msg(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(message_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let existing = sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = $1")
        .bind(message_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Message not found".into()))?;

    // Check ownership (admin override could be added later)
    if existing.sender_id != auth.user_id {
        return Err(AppError::Forbidden(
            "You can only delete your own messages".into(),
        ));
    }

    sqlx::query("DELETE FROM messages WHERE id = $1")
        .bind(message_id)
        .execute(&state.db)
        .await?;

    // Broadcast delete event via WebSocket
    if let Ok(workspace_id) =
        sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM channels WHERE id = $1")
            .bind(existing.channel_id.unwrap_or_default())
            .fetch_one(&state.db)
            .await
    {
        let event = crate::ws::handler::WsServerMessage::MessageDeleted {
            channel_id: existing.channel_id.unwrap_or_default(),
            message_id: existing.id,
        };
        let _ = crate::ws::pubsub::publish_event(&state.redis, workspace_id, &event).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Helpers ──

/// Verify that a user is a member of the given channel.
async fn require_channel_member(
    state: &AppState,
    channel_id: Uuid,
    user_id: Uuid,
) -> AppResult<()> {
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2)",
    )
    .bind(channel_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    if !is_member {
        return Err(AppError::Forbidden("Not a member of this channel".into()));
    }

    Ok(())
}

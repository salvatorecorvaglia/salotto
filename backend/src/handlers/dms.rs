use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    models::message::{ListMessagesQuery, Message, MessagePage, SendMessagePayload},
    state::AppState,
};

#[derive(Deserialize)]
pub struct CreateDmPayload {
    pub user_ids: Vec<Uuid>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct DirectConversationResponse {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub members: serde_json::Value, // Array of UserProfiles
}

/// POST /api/v1/workspaces/{workspace_id}/dms
///
/// Start a new direct conversation (1:1 or group DM) within a workspace.
pub async fn create_dm(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    Json(payload): Json<CreateDmPayload>,
) -> AppResult<(StatusCode, Json<DirectConversationResponse>)> {
    // 1. Verify creator workspace membership
    super::workspaces::require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let conversation_id = Uuid::now_v7();

    // 2. Create conversation
    sqlx::query(
        "INSERT INTO direct_conversations (id, workspace_id) VALUES ($1, $2)",
    )
    .bind(conversation_id)
    .bind(workspace_id)
    .execute(&state.db)
    .await?;

    // 3. Add members (including creator)
    sqlx::query(
        "INSERT INTO direct_conversation_members (conversation_id, user_id) VALUES ($1, $2)",
    )
    .bind(conversation_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    for u_id in &payload.user_ids {
        if *u_id != auth.user_id {
            // Verify target user is in the workspace before adding
            let is_member = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2)",
            )
            .bind(workspace_id)
            .bind(u_id)
            .fetch_one(&state.db)
            .await?;

            if is_member {
                sqlx::query(
                    "INSERT INTO direct_conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                )
                .bind(conversation_id)
                .bind(u_id)
                .execute(&state.db)
                .await?;
            }
        }
    }

    // 4. Fetch the full created conversation details
    let details = fetch_dm_details(&state.db, conversation_id, auth.user_id).await?;

    Ok((StatusCode::CREATED, Json(details)))
}

/// GET /api/v1/workspaces/{workspace_id}/dms
///
/// List all direct conversations in a workspace that the user is a member of.
pub async fn list_dms(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
) -> AppResult<Json<Vec<DirectConversationResponse>>> {
    // Verify membership
    super::workspaces::require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let conversations = sqlx::query_as::<_, DirectConversationResponse>(
        r#"
        SELECT 
            dc.id,
            dc.workspace_id,
            dc.created_at,
            json_agg(
                json_build_object(
                    'id', u.id,
                    'username', u.username,
                    'display_name', u.display_name,
                    'avatar_url', u.avatar_url,
                    'status', u.status,
                    'last_seen_at', u.last_seen_at
                )
            ) as members
        FROM direct_conversations dc
        INNER JOIN direct_conversation_members dcm ON dcm.conversation_id = dc.id
        INNER JOIN direct_conversation_members dcm2 ON dcm2.conversation_id = dc.id
        INNER JOIN users u ON u.id = dcm2.user_id
        WHERE dc.workspace_id = $1 AND dcm.user_id = $2
        GROUP BY dc.id, dc.workspace_id, dc.created_at
        ORDER BY dc.created_at DESC
        "#,
    )
    .bind(workspace_id)
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(conversations))
}

/// GET /api/v1/dms/{conversation_id}/messages
///
/// Get message history for a direct conversation with cursor-based pagination.
pub async fn list_dm_messages(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    Query(query): Query<ListMessagesQuery>,
) -> AppResult<Json<MessagePage>> {
    // 1. Verify membership
    require_dm_member(&state.db, conversation_id, auth.user_id).await?;

    let limit = query.limit.unwrap_or(50).min(100).max(1);
    let fetch_limit = limit + 1;

    let mut messages = if let Some(before) = query.before {
        sqlx::query_as::<_, Message>(
            r#"
            SELECT * FROM messages
            WHERE conversation_id = $1 AND id < $2
            ORDER BY id DESC
            LIMIT $3
            "#,
        )
        .bind(conversation_id)
        .bind(before)
        .bind(fetch_limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, Message>(
            r#"
            SELECT * FROM messages
            WHERE conversation_id = $1
            ORDER BY id DESC
            LIMIT $2
            "#,
        )
        .bind(conversation_id)
        .bind(fetch_limit)
        .fetch_all(&state.db)
        .await?
    };

    let has_more = messages.len() as i64 > limit;
    if has_more {
        messages.pop();
    }

    Ok(Json(MessagePage { messages, has_more }))
}

/// POST /api/v1/dms/{conversation_id}/messages
///
/// Send a message in a direct conversation.
pub async fn send_dm_message(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(conversation_id): Path<Uuid>,
    Json(payload): Json<SendMessagePayload>,
) -> AppResult<(StatusCode, Json<Message>)> {
    // 1. Verify conversation membership
    require_dm_member(&state.db, conversation_id, auth.user_id).await?;

    let message_id = Uuid::now_v7();
    let attachments = payload
        .attachments
        .map(|a| serde_json::to_value(a).unwrap_or_default())
        .unwrap_or_else(|| serde_json::json!([]));

    // 2. Insert message
    let message = sqlx::query_as::<_, Message>(
        r#"
        INSERT INTO messages (id, conversation_id, sender_id, parent_id, content, attachments)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(message_id)
    .bind(conversation_id)
    .bind(auth.user_id)
    .bind(payload.parent_id)
    .bind(&payload.content)
    .bind(&attachments)
    .fetch_one(&state.db)
    .await?;

    // 3. Find workspace ID of conversation to broadcast via Redis pub/sub
    let workspace_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT workspace_id FROM direct_conversations WHERE id = $1",
    )
    .bind(conversation_id)
    .fetch_one(&state.db)
    .await?;

    // 4. Broadcast event (Reuse WsServerMessage::NewMessage, client checks destination fields)
    let event = crate::ws::handler::WsServerMessage::NewMessage {
        channel_id: conversation_id, // We pass conversation_id as channel_id for compatibility
        message_id: message.id,
        sender_id: message.sender_id,
        content: message.content.clone(),
    };
    let _ = crate::ws::pubsub::publish_event(&state.redis, workspace_id, &event).await;

    Ok((StatusCode::CREATED, Json(message)))
}

// ── Helpers ──

async fn require_dm_member(db: &sqlx::PgPool, conversation_id: Uuid, user_id: Uuid) -> AppResult<()> {
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2)",
    )
    .bind(conversation_id)
    .bind(user_id)
    .fetch_one(db)
    .await?;

    if !is_member {
        return Err(AppError::Forbidden("Not a member of this DM conversation".into()));
    }
    Ok(())
}

async fn fetch_dm_details(db: &sqlx::PgPool, conversation_id: Uuid, user_id: Uuid) -> AppResult<DirectConversationResponse> {
    sqlx::query_as::<_, DirectConversationResponse>(
        r#"
        SELECT 
            dc.id,
            dc.workspace_id,
            dc.created_at,
            json_agg(
                json_build_object(
                    'id', u.id,
                    'username', u.username,
                    'display_name', u.display_name,
                    'avatar_url', u.avatar_url,
                    'status', u.status,
                    'last_seen_at', u.last_seen_at
                )
            ) as members
        FROM direct_conversations dc
        INNER JOIN direct_conversation_members dcm ON dcm.conversation_id = dc.id
        INNER JOIN users u ON u.id = dcm.user_id
        WHERE dc.id = $1 AND EXISTS(
            SELECT 1 FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2
        )
        GROUP BY dc.id, dc.workspace_id, dc.created_at
        "#,
    )
    .bind(conversation_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .map_err(Into::into)
}

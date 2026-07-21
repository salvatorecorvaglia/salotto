use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::middleware::AuthUser, error::AppResult, models::message::Message, state::AppState,
};

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Serialize)]
pub struct SearchResultItem {
    #[serde(flatten)]
    pub message: Message,
    pub channel_name: Option<String>,
    pub conversation_members: Option<serde_json::Value>, // Array of usernames for DMs
}

/// GET /api/v1/workspaces/{workspace_id}/search?q=<query>
///
/// Securely search for messages across all accessible text channels and
/// direct message threads in a workspace.
pub async fn search_messages(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Vec<SearchResultItem>>> {
    // 1. Verify workspace membership
    super::workspaces::require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let search_pattern = format!("%{}%", query.q);

    // 2. Query Postgres
    let results = sqlx::query_as::<_, SearchResultItem>(
        r#"
        SELECT 
            m.id,
            m.channel_id,
            m.sender_id,
            m.parent_id,
            m.content,
            m.attachments,
            m.is_edited,
            m.created_at,
            m.updated_at,
            m.conversation_id,
            c.name as channel_name,
            (
                SELECT json_agg(u.username) 
                FROM direct_conversation_members dcm
                INNER JOIN users u ON u.id = dcm.user_id
                WHERE dcm.conversation_id = m.conversation_id
            ) as conversation_members
        FROM messages m
        LEFT JOIN channels c ON c.id = m.channel_id
        LEFT JOIN direct_conversations dc ON dc.id = m.conversation_id
        WHERE (
            -- 1. Channel messages (public or private user is in)
            (m.channel_id IS NOT NULL AND c.workspace_id = $1 AND (
                c.is_private = FALSE
                OR EXISTS (
                    SELECT 1 FROM channel_members cm
                    WHERE cm.channel_id = c.id AND cm.user_id = $2
                )
            ))
            OR
            -- 2. Direct Messages user is in
            (m.conversation_id IS NOT NULL AND dc.workspace_id = $1 AND EXISTS (
                SELECT 1 FROM direct_conversation_members dcm
                WHERE dcm.conversation_id = dc.id AND dcm.user_id = $2
            ))
        )
        AND m.content ILIKE $3
        ORDER BY m.created_at DESC
        LIMIT 50
        "#,
    )
    .bind(workspace_id)
    .bind(auth.user_id)
    .bind(&search_pattern)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(results))
}

// Implement sqlx FromRow for SearchResultItem manually because of nested serde serialization
impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for SearchResultItem {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            message: Message {
                id: row.try_get("id")?,
                channel_id: row.try_get("channel_id").ok(),
                conversation_id: row.try_get("conversation_id").ok(),
                sender_id: row.try_get("sender_id")?,
                parent_id: row.try_get("parent_id")?,
                content: row.try_get("content")?,
                attachments: row.try_get("attachments")?,
                is_edited: row.try_get("is_edited")?,
                reactions: row.try_get("reactions").ok(),
                created_at: row.try_get("created_at")?,
                updated_at: row.try_get("updated_at")?,
            },
            channel_name: row.try_get("channel_name")?,
            conversation_members: row.try_get("conversation_members")?,
        })
    }
}

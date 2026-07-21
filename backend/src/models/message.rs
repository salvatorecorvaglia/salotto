use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

/// Message row from the database.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Message {
    pub id: Uuid,
    pub channel_id: Option<Uuid>,
    pub conversation_id: Option<Uuid>,
    pub sender_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub content: String,
    /// JSONB array of attachment metadata.
    pub attachments: serde_json::Value,
    pub is_edited: bool,
    /// JSON aggregation of reactions for this message.
    pub reactions: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Attachment metadata stored in the `attachments` JSONB column.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    /// S3 object key.
    pub key: String,
    /// Original filename.
    pub filename: String,
    /// MIME type (e.g., "image/png").
    pub content_type: String,
    /// File size in bytes.
    pub size: u64,
}

/// Payload for sending a new message.
#[derive(Debug, Deserialize, Validate)]
pub struct SendMessagePayload {
    #[validate(length(min = 1, max = 4000, message = "Message content must be 1–4000 characters"))]
    pub content: String,

    /// Optional parent message ID for threaded replies.
    pub parent_id: Option<Uuid>,

    /// Optional attachment metadata (files uploaded separately).
    pub attachments: Option<Vec<Attachment>>,
}

/// Payload for editing an existing message.
#[derive(Debug, Deserialize, Validate)]
pub struct EditMessagePayload {
    #[validate(length(min = 1, max = 4000, message = "Message content must be 1–4000 characters"))]
    pub content: String,
}

/// Query parameters for cursor-paginated message listing.
#[derive(Debug, Deserialize)]
pub struct ListMessagesQuery {
    /// Cursor: fetch messages with `id < before` (UUIDv7 is time-ordered).
    pub before: Option<Uuid>,
    /// Page size (default: 50, max: 100).
    pub limit: Option<i64>,
}

/// Paginated response wrapper for messages.
#[derive(Debug, Serialize)]
pub struct MessagePage {
    pub messages: Vec<Message>,
    /// If `true`, there are more messages before the oldest one in this page.
    pub has_more: bool,
}

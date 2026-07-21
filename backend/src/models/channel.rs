use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

/// Channel row from the database.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Channel {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub kind: String,
    pub topic: Option<String>,
    pub is_private: bool,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}

/// Channel membership join-table row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ChannelMember {
    pub channel_id: Uuid,
    pub user_id: Uuid,
    pub joined_at: DateTime<Utc>,
    pub last_read_at: Option<DateTime<Utc>>,
}

/// Channel types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelKind {
    Text,
    Voice,
    Announcement,
}

impl ChannelKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Voice => "voice",
            Self::Announcement => "announcement",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "text" => Some(Self::Text),
            "voice" => Some(Self::Voice),
            "announcement" => Some(Self::Announcement),
            _ => None,
        }
    }
}

/// Payload for creating a channel.
#[derive(Debug, Deserialize, Validate)]
pub struct CreateChannelPayload {
    #[validate(length(min = 1, max = 64, message = "Channel name must be 1–64 characters"))]
    pub name: String,

    /// One of: "text", "voice", "announcement". Defaults to "text".
    pub kind: Option<String>,

    pub topic: Option<String>,

    /// Defaults to `false` (public channel).
    pub is_private: Option<bool>,
}

/// Payload for updating a channel.
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateChannelPayload {
    #[validate(length(min = 1, max = 64))]
    pub name: Option<String>,
    pub topic: Option<String>,
    pub is_private: Option<bool>,
}

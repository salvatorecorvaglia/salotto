use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

/// Workspace row from the database.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub created_at: DateTime<Utc>,
}

/// Workspace membership join-table row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkspaceMember {
    pub workspace_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

/// RBAC roles for workspace membership.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceRole {
    Owner,
    Admin,
    Member,
    Guest,
}

impl WorkspaceRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Admin => "admin",
            Self::Member => "member",
            Self::Guest => "guest",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "owner" => Some(Self::Owner),
            "admin" => Some(Self::Admin),
            "member" => Some(Self::Member),
            "guest" => Some(Self::Guest),
            _ => None,
        }
    }

    /// Check if this role has at least admin-level privileges.
    pub fn is_admin_or_above(&self) -> bool {
        matches!(self, Self::Owner | Self::Admin)
    }
}

/// Payload for creating a workspace.
#[derive(Debug, Deserialize, Validate)]
pub struct CreateWorkspacePayload {
    #[validate(length(min = 2, max = 64, message = "Workspace name must be 2–64 characters"))]
    pub name: String,

    #[validate(length(min = 2, max = 64, message = "Slug must be 2–64 characters"))]
    #[validate(custom(function = "validate_slug"))]
    pub slug: String,

    pub description: Option<String>,
}

/// Validate that a slug contains only lowercase alphanumeric characters and hyphens,
/// starts and ends with an alphanumeric character.
fn validate_slug(slug: &str) -> Result<(), validator::ValidationError> {
    let valid = !slug.is_empty()
        && slug.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && slug.chars().next().map_or(false, |c| c.is_ascii_alphanumeric())
        && slug.chars().last().map_or(false, |c| c.is_ascii_alphanumeric())
        && !slug.contains("--");

    if valid {
        Ok(())
    } else {
        let mut err = validator::ValidationError::new("invalid_slug");
        err.message = Some("Slug must be lowercase alphanumeric with single hyphens, not starting or ending with a hyphen".into());
        Err(err)
    }
}

/// Payload for inviting a member to a workspace.
#[derive(Debug, Deserialize)]
pub struct AddMemberPayload {
    pub user_id: Uuid,
    pub role: Option<String>,
}

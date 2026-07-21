use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

/// Full user row from the database.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: String,
    /// Never serialized to API responses (skip_serializing).
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub avatar_url: Option<String>,
    pub status: String,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Safe public projection of a user (no password hash, no email).
#[derive(Debug, Serialize)]
pub struct UserProfile {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub status: String,
    pub last_seen_at: Option<DateTime<Utc>>,
}

impl From<User> for UserProfile {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            status: u.status,
            last_seen_at: u.last_seen_at,
        }
    }
}

/// Payload for user registration.
#[derive(Debug, Deserialize, Validate)]
pub struct RegisterPayload {
    #[validate(length(min = 3, max = 32, message = "Username must be 3–32 characters"))]
    pub username: String,

    #[validate(email(message = "Invalid email address"))]
    pub email: String,

    #[validate(length(min = 8, max = 128, message = "Password must be 8–128 characters"))]
    pub password: String,

    #[validate(length(max = 64, message = "Display name must be at most 64 characters"))]
    pub display_name: Option<String>,
}

/// Payload for user login.
#[derive(Debug, Deserialize)]
pub struct LoginPayload {
    pub email: String,
    pub password: String,
}

/// Payload for refreshing tokens.
#[derive(Debug, Deserialize)]
pub struct RefreshPayload {
    pub refresh_token: String,
}

/// Payload for updating the current user's profile.
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateProfilePayload {
    #[validate(length(min = 1, max = 64, message = "Display name must be 1–64 characters"))]
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

/// Auth response returned after login/register/refresh.
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user: UserProfile,
}

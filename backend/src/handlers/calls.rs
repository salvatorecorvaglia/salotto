use axum::{
    extract::{Path, State},
    Json,
};
use livekit_api::access_token::{AccessToken, VideoGrants};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Serialize)]
pub struct CallTokenResponse {
    pub token: String,
    pub room_name: String,
    pub livekit_url: String,
}

/// POST /api/v1/channels/{channel_id}/calls/token
///
/// Generate a LiveKit access token for joining a video/voice call room associated
/// with a specific channel. Uses the channel ID as the LiveKit room name.
pub async fn generate_call_token(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(channel_id): Path<Uuid>,
) -> AppResult<Json<CallTokenResponse>> {
    // 1. Fetch channel and verify it exists
    let (workspace_id, _channel_name) = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT workspace_id, name FROM channels WHERE id = $1",
    )
    .bind(channel_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;

    // 2. Verify user is member of this workspace
    super::workspaces::require_workspace_member(&state, workspace_id, auth.user_id).await?;

    // 3. Fetch user's display name for LiveKit profile
    let display_name =
        sqlx::query_scalar::<_, String>("SELECT display_name FROM users WHERE id = $1")
            .bind(auth.user_id)
            .fetch_one(&state.db)
            .await?;

    // 4. Generate the token
    let api_key = &state.config.livekit_api_key;
    let api_secret = &state.config.livekit_api_secret;
    let room_name = channel_id.to_string();

    let grants = VideoGrants {
        room_join: true,
        room: room_name.clone(),
        ..Default::default()
    };

    let token = AccessToken::with_api_key(api_key, api_secret)
        .with_identity(&auth.user_id.to_string())
        .with_name(&display_name)
        .with_grants(grants)
        .to_jwt()
        .map_err(|e| {
            AppError::Internal(anyhow::anyhow!(
                "Failed to encode LiveKit access token: {}",
                e
            ))
        })?;

    Ok(Json(CallTokenResponse {
        token,
        room_name,
        livekit_url: state.config.livekit_url.clone(),
    }))
}

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::jwt::validate_token,
    error::AppError,
    state::AppState,
};

/// Query parameter for WebSocket authentication.
#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    /// JWT access token.
    pub token: String,
}

/// Messages sent FROM the client TO the server.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsClientMessage {
    /// The user started typing in a channel.
    TypingStart { channel_id: Uuid },
    /// The user stopped typing.
    TypingStop { channel_id: Uuid },
    /// Client ping (keepalive).
    Ping,
}

/// Messages sent FROM the server TO the client.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsServerMessage {
    /// A new message was posted in a channel.
    NewMessage {
        channel_id: Uuid,
        message_id: Uuid,
        sender_id: Uuid,
        content: String,
    },
    /// A message was edited.
    MessageEdited {
        channel_id: Uuid,
        message_id: Uuid,
        content: String,
    },
    /// A message was deleted.
    MessageDeleted {
        channel_id: Uuid,
        message_id: Uuid,
    },
    /// A user is typing in a channel.
    Typing {
        channel_id: Uuid,
        user_id: Uuid,
        is_typing: bool,
    },
    /// A user's presence status changed.
    Presence {
        user_id: Uuid,
        status: String,
    },
    /// Server pong (keepalive response).
    Pong,
    /// Error message.
    Error {
        message: String,
    },
}

/// GET /ws?token=<jwt>
///
/// WebSocket upgrade handler. Authenticates the user via a JWT
/// query parameter, then upgrades the connection.
pub async fn ws_upgrade(
    State(state): State<AppState>,
    Query(auth): Query<WsAuthQuery>,
    ws: WebSocketUpgrade,
) -> Result<impl IntoResponse, AppError> {
    // Validate the token before upgrading
    let claims = validate_token(&auth.token, &state.config.jwt_secret)?;

    if claims.token_type != "access" {
        return Err(AppError::Unauthorized("Expected access token".into()));
    }

    let user_id = claims.sub;
    tracing::info!(%user_id, "WebSocket upgrade requested");

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, state, user_id)))
}

/// Handle an established WebSocket connection.
///
/// This is the skeleton — full pub/sub integration with Redis
/// will be implemented in Phase 2.
async fn handle_socket(mut socket: WebSocket, _state: AppState, user_id: Uuid) {
    tracing::info!(%user_id, "WebSocket connected");

    // TODO (Phase 2):
    // 1. Subscribe to Redis pub/sub channels for the user's workspace(s)
    // 2. Spawn a task to forward Redis messages → WebSocket
    // 3. Handle incoming WS messages (typing indicators, etc.)

    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(Message::Text(text)) => {
                // Try to parse as a client message
                match serde_json::from_str::<WsClientMessage>(&text) {
                    Ok(WsClientMessage::Ping) => {
                        let pong = serde_json::to_string(&WsServerMessage::Pong).unwrap();
                        if socket.send(Message::Text(pong.into())).await.is_err() {
                            break;
                        }
                    }
                    Ok(WsClientMessage::TypingStart { channel_id }) => {
                        tracing::debug!(%user_id, %channel_id, "typing start");
                        // TODO: Broadcast via Redis pub/sub
                    }
                    Ok(WsClientMessage::TypingStop { channel_id }) => {
                        tracing::debug!(%user_id, %channel_id, "typing stop");
                        // TODO: Broadcast via Redis pub/sub
                    }
                    Err(e) => {
                        tracing::warn!(%user_id, error = %e, "Invalid WebSocket message");
                        let err = serde_json::to_string(&WsServerMessage::Error {
                            message: "Invalid message format".into(),
                        })
                        .unwrap();
                        if socket.send(Message::Text(err.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                tracing::info!(%user_id, "WebSocket closed by client");
                break;
            }
            Err(e) => {
                tracing::warn!(%user_id, error = %e, "WebSocket error");
                break;
            }
            _ => {} // Ignore binary, ping, pong frames
        }
    }

    tracing::info!(%user_id, "WebSocket disconnected");

    // TODO: Update user presence to "offline" via Redis
}

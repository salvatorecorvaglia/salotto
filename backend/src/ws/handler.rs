use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use futures_util::{SinkExt, StreamExt};

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
#[derive(Debug, Serialize, Deserialize, Clone)]
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
#[derive(Debug, Serialize, Deserialize, Clone)]
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
    /// A user added an emoji reaction to a message.
    ReactionAdded {
        message_id: Uuid,
        user_id: Uuid,
        emoji: String,
    },
    /// A user removed an emoji reaction.
    ReactionRemoved {
        message_id: Uuid,
        user_id: Uuid,
        emoji: String,
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
async fn handle_socket(socket: WebSocket, state: AppState, user_id: Uuid) {
    tracing::info!(%user_id, "WebSocket connected");

    // 1. Get workspaces the user belongs to
    let workspaces = match sqlx::query_scalar::<_, Uuid>(
        "SELECT workspace_id FROM workspace_members WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await {
        Ok(ws) => ws,
        Err(e) => {
            tracing::error!(%user_id, error = ?e, "Failed to fetch user workspaces");
            return;
        }
    };

    // 2. Set user status to 'online' and broadcast presence
    let _ = sqlx::query("UPDATE users SET status = 'online', last_seen_at = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await;

    for ws_id in &workspaces {
        let event = WsServerMessage::Presence {
            user_id,
            status: "online".to_string(),
        };
        let _ = crate::ws::pubsub::publish_event(&state.redis, *ws_id, &event).await;
    }

    // 3. Setup async PubSub connection to Redis
    let mut pubsub = match state.redis.get_async_pubsub().await {
        Ok(ps) => ps,
        Err(e) => {
            tracing::error!(%user_id, error = ?e, "Failed to get async pubsub connection");
            return;
        }
    };

    // Subscribe to all workspace channels
    for ws_id in &workspaces {
        let channel = format!("workspace:{}", ws_id);
        if let Err(e) = pubsub.subscribe(&channel).await {
            tracing::error!(%user_id, %channel, error = ?e, "Failed to subscribe to workspace channel");
            return;
        }
    }

    // Split WebSocket
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Outgoing message channel to coordinate writes to the WebSocket
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Spawn task to write messages to the WebSocket
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Spawn task to forward Redis PubSub messages to the WebSocket writer channel
    let tx_redis = tx.clone();
    let forward_task = tokio::spawn(async move {
        let mut pubsub = pubsub;
        let mut pubsub_stream = pubsub.on_message();
        while let Some(msg) = pubsub_stream.next().await {
            let payload: String = match msg.get_payload() {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!(error = ?e, "Failed to read Redis pubsub payload");
                    continue;
                }
            };
            if tx_redis.send(Message::Text(payload.into())).is_err() {
                break;
            }
        }
    });

    // 4. Handle incoming messages from the client
    let state_clone = state.clone();
    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match serde_json::from_str::<WsClientMessage>(&text) {
                    Ok(WsClientMessage::Ping) => {
                        let pong = serde_json::to_string(&WsServerMessage::Pong).unwrap();
                        let _ = tx.send(Message::Text(pong.into()));
                    }
                    Ok(WsClientMessage::TypingStart { channel_id }) => {
                        if let Ok(workspace_id) = get_channel_workspace(&state_clone.db, channel_id).await {
                            let event = WsServerMessage::Typing {
                                channel_id,
                                user_id,
                                is_typing: true,
                            };
                            let _ = crate::ws::pubsub::publish_event(&state_clone.redis, workspace_id, &event).await;
                        }
                    }
                    Ok(WsClientMessage::TypingStop { channel_id }) => {
                        if let Ok(workspace_id) = get_channel_workspace(&state_clone.db, channel_id).await {
                            let event = WsServerMessage::Typing {
                                channel_id,
                                user_id,
                                is_typing: false,
                            };
                            let _ = crate::ws::pubsub::publish_event(&state_clone.redis, workspace_id, &event).await;
                        }
                    }
                    Err(e) => {
                        tracing::warn!(%user_id, error = %e, "Invalid client message");
                        let err_msg = serde_json::to_string(&WsServerMessage::Error {
                            message: "Invalid message format".into(),
                        })
                        .unwrap();
                        let _ = tx.send(Message::Text(err_msg.into()));
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
            _ => {}
        }
    }

    // Clean up tasks
    forward_task.abort();
    write_task.abort();

    // 5. Update user presence to offline and broadcast
    let _ = sqlx::query("UPDATE users SET status = 'offline', last_seen_at = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await;

    for ws_id in &workspaces {
        let event = WsServerMessage::Presence {
            user_id,
            status: "offline".to_string(),
        };
        let _ = crate::ws::pubsub::publish_event(&state.redis, *ws_id, &event).await;
    }

    tracing::info!(%user_id, "WebSocket disconnected");
}

/// Helper function to fetch the workspace Uuid for a given channel Uuid
async fn get_channel_workspace(db: &sqlx::PgPool, channel_id: Uuid) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM channels WHERE id = $1")
        .bind(channel_id)
        .fetch_one(db)
        .await
}

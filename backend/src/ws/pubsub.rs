use crate::error::AppError;
use crate::ws::handler::WsServerMessage;
use serde_json;
use uuid::Uuid;

/// Publish an event to the Redis pub/sub channel for a specific workspace.
pub async fn publish_event(
    redis: &redis::Client,
    workspace_id: Uuid,
    event: &WsServerMessage,
) -> Result<(), AppError> {
    let mut conn = redis.get_multiplexed_async_connection().await?;
    let payload = serde_json::to_string(event)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to serialize event: {}", e)))?;

    let channel = format!("workspace:{}", workspace_id);

    // PUBLISH channel payload
    redis::cmd("PUBLISH")
        .arg(&channel)
        .arg(&payload)
        .query_async::<()>(&mut conn)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to publish to Redis: {}", e)))?;

    Ok(())
}

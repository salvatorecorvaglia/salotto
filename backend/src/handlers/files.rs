use axum::{
    extract::{Multipart, Path, State},
    Json,
};
use uuid::Uuid;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    models::message::Attachment,
    state::AppState,
};

/// POST /api/v1/files/upload
///
/// Receive a multipart form upload containing a single file field 'file',
/// stream/upload it to MinIO (S3 compatible), and return the attachment metadata.
pub async fn upload_file(
    auth: AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> AppResult<Json<Attachment>> {
    let mut key = None;
    let mut filename = None;
    let mut content_type = None;
    let mut size = 0;

    // Optional query parameters for workspace, channel, or conversation scoping
    let mut workspace_id_opt: Option<Uuid> = None;
    let mut channel_id_opt: Option<Uuid> = None;
    let mut conversation_id_opt: Option<Uuid> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to parse multipart field: {}", e)))?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "workspace_id" {
            if let Ok(txt) = field.text().await {
                workspace_id_opt = Uuid::parse_str(&txt).ok();
            }
        } else if name == "channel_id" {
            if let Ok(txt) = field.text().await {
                channel_id_opt = Uuid::parse_str(&txt).ok();
            }
        } else if name == "conversation_id" {
            if let Ok(txt) = field.text().await {
                conversation_id_opt = Uuid::parse_str(&txt).ok();
            }
        } else if name == "file" {
            let fname = field.file_name().unwrap_or("file").to_string();
            let ctype = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();

            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("Failed to read field bytes: {}", e)))?;
            size = data.len() as u64;

            let file_id = Uuid::now_v7();
            let k = format!("{}/{}", file_id, fname);

            // If workspace_id was provided, verify requester is a workspace member
            if let Some(ws_id) = workspace_id_opt {
                super::workspaces::require_workspace_member(&state, ws_id, auth.user_id).await?;
            } else if let Some(chan_id) = channel_id_opt {
                let ws_id = sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM channels WHERE id = $1")
                    .bind(chan_id)
                    .fetch_optional(&state.db)
                    .await?
                    .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;
                super::workspaces::require_workspace_member(&state, ws_id, auth.user_id).await?;
                workspace_id_opt = Some(ws_id);
            }

            tracing::info!(
                filename = %fname,
                size = %size,
                content_type = %ctype,
                key = %k,
                "Uploading file to S3"
            );

            state
                .s3
                .put_object()
                .bucket(state.config.s3_bucket.as_str())
                .key(&k)
                .body(data.into())
                .content_type(&ctype)
                .send()
                .await
                .map_err(|e| {
                    AppError::Internal(anyhow::anyhow!("MinIO S3 PutObject request failed: {}", e))
                })?;

            // Track file metadata in database if workspace_id is known
            if let Some(ws_id) = workspace_id_opt {
                let _ = sqlx::query(
                    r#"
                    INSERT INTO files (id, key, workspace_id, channel_id, conversation_id, uploader_id, filename, content_type, size)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (key) DO NOTHING
                    "#,
                )
                .bind(file_id)
                .bind(&k)
                .bind(ws_id)
                .bind(channel_id_opt)
                .bind(conversation_id_opt)
                .bind(auth.user_id)
                .bind(&fname)
                .bind(&ctype)
                .bind(size as i64)
                .execute(&state.db)
                .await;
            }

            key = Some(k);
            filename = Some(fname);
            content_type = Some(ctype);
            break;
        }
    }

    let key = key.ok_or_else(|| AppError::BadRequest("Missing 'file' field in request".into()))?;
    let filename = filename.unwrap();
    let content_type = content_type.unwrap();

    Ok(Json(Attachment {
        key,
        filename,
        content_type,
        size,
    }))
}

/// GET /api/v1/files/download/{*key}
///
/// Securely download a file after verifying workspace authorization.
pub async fn download_file(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> AppResult<impl axum::response::IntoResponse> {
    // If recorded in files table, enforce workspace membership check
    if let Some(ws_id) = sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM files WHERE key = $1")
        .bind(&key)
        .fetch_optional(&state.db)
        .await?
    {
        super::workspaces::require_workspace_member(&state, ws_id, auth.user_id).await?;
    }

    let output = state
        .s3
        .get_object()
        .bucket(state.config.s3_bucket.as_str())
        .key(&key)
        .send()
        .await
        .map_err(|e| AppError::NotFound(format!("File not found in S3: {}", e)))?;

    let content_type = output
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();

    let data = output
        .body
        .collect()
        .await
        .map_err(|e| {
            AppError::Internal(anyhow::anyhow!("Failed to read body bytes from S3: {}", e))
        })?
        .into_bytes();

    Ok(([(axum::http::header::CONTENT_TYPE, content_type)], data))
}

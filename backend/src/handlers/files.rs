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
    _auth: AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> AppResult<Json<Attachment>> {
    let mut key = None;
    let mut filename = None;
    let mut content_type = None;
    let mut size = 0;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to parse multipart field: {}", e)))?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            let fname = field.file_name().unwrap_or("file").to_string();
            let ctype = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();

            // Read the full binary data of the file field
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("Failed to read field bytes: {}", e)))?;
            size = data.len() as u64;

            // Generate a time-ordered key prefix to prevent collision and organize files
            let k = format!("{}/{}", Uuid::now_v7(), fname);

            tracing::info!(
                filename = %fname,
                size = %size,
                content_type = %ctype,
                key = %k,
                "Uploading file to S3"
            );

            // Upload the file to S3/MinIO
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
/// Download a file from S3 bucket and stream it back.
pub async fn download_file(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> AppResult<impl axum::response::IntoResponse> {
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

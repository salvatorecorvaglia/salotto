use std::sync::Arc;

use sqlx::PgPool;

use crate::config::Config;

/// Shared application state, injected into all handlers via Axum's `State` extractor.
///
/// Cloning is cheap — all inner types are internally reference-counted.
#[derive(Clone)]
pub struct AppState {
    /// PostgreSQL connection pool.
    pub db: PgPool,
    /// Redis client (create async connections from this).
    pub redis: redis::Client,
    /// S3-compatible client for MinIO file storage.
    pub s3: aws_sdk_s3::Client,
    /// Typed application configuration.
    pub config: Arc<Config>,
}

impl AppState {
    /// Initialize all connections and clients from the given configuration.
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        // ── PostgreSQL connection pool ──
        let db = PgPool::connect(&config.database_url).await?;
        tracing::info!("Connected to PostgreSQL");

        // ── Redis client ──
        let redis = redis::Client::open(config.redis_url.as_str())?;
        // Verify connectivity
        let mut conn = redis.get_multiplexed_async_connection().await?;
        redis::cmd("PING").query_async::<String>(&mut conn).await?;
        tracing::info!("Connected to Redis");

        // ── S3 / MinIO client ──
        let s3_creds = aws_sdk_s3::config::Credentials::new(
            &config.s3_access_key,
            &config.s3_secret_key,
            None,
            None,
            "salotto-env",
        );

        let s3_config = aws_sdk_s3::Config::builder()
            .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
            .endpoint_url(&config.s3_endpoint)
            .region(aws_sdk_s3::config::Region::new(config.s3_region.clone()))
            .credentials_provider(s3_creds)
            .force_path_style(true) // Required for MinIO
            .build();

        let s3 = aws_sdk_s3::Client::from_conf(s3_config);
        tracing::info!(endpoint = %config.s3_endpoint, "S3/MinIO client initialized");

        Ok(Self {
            db,
            redis,
            s3,
            config: Arc::new(config),
        })
    }
}

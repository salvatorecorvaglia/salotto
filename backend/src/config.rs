use std::env;

/// Typed application configuration, parsed from environment variables.
#[derive(Clone, Debug)]
pub struct Config {
    // ── Database ──
    pub database_url: String,

    // ── Redis ──
    pub redis_url: String,

    // ── S3 / MinIO ──
    pub s3_endpoint: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub s3_bucket: String,
    pub s3_region: String,

    // ── JWT ──
    pub jwt_secret: String,
    pub jwt_access_ttl_secs: i64,
    pub jwt_refresh_ttl_secs: i64,

    // ── LiveKit ──
    pub livekit_url: String,
    pub livekit_api_key: String,
    pub livekit_api_secret: String,

    // ── Server ──
    pub host: String,
    pub port: u16,
}

impl Config {
    /// Load configuration from environment variables.
    ///
    /// Required vars: `DATABASE_URL`, `JWT_SECRET`.
    /// All others have sensible defaults for local development.
    pub fn from_env() -> Result<Self, env::VarError> {
        Ok(Self {
            // Required
            database_url: env::var("DATABASE_URL")?,
            jwt_secret: env::var("JWT_SECRET")?,

            // Optional with defaults
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),

            s3_endpoint: env::var("S3_ENDPOINT")
                .unwrap_or_else(|_| "http://127.0.0.1:9000".into()),
            s3_access_key: env::var("S3_ACCESS_KEY")
                .unwrap_or_else(|_| "minioadmin".into()),
            s3_secret_key: env::var("S3_SECRET_KEY")
                .unwrap_or_else(|_| "minioadmin".into()),
            s3_bucket: env::var("S3_BUCKET")
                .unwrap_or_else(|_| "salotto".into()),
            s3_region: env::var("S3_REGION")
                .unwrap_or_else(|_| "us-east-1".into()),

            jwt_access_ttl_secs: env::var("JWT_ACCESS_TTL_SECS")
                .unwrap_or_else(|_| "900".into())
                .parse()
                .expect("JWT_ACCESS_TTL_SECS must be a valid i64"),
            jwt_refresh_ttl_secs: env::var("JWT_REFRESH_TTL_SECS")
                .unwrap_or_else(|_| "604800".into())
                .parse()
                .expect("JWT_REFRESH_TTL_SECS must be a valid i64"),

            livekit_url: env::var("LIVEKIT_URL")
                .unwrap_or_else(|_| "ws://127.0.0.1:7880".into()),
            livekit_api_key: env::var("LIVEKIT_API_KEY")
                .unwrap_or_else(|_| "devkey".into()),
            livekit_api_secret: env::var("LIVEKIT_API_SECRET")
                .unwrap_or_else(|_| "devsecret".into()),

            host: env::var("HOST")
                .unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".into())
                .parse()
                .expect("PORT must be a valid u16"),
        })
    }
}

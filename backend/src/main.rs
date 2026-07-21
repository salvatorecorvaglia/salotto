use std::net::SocketAddr;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod auth;
mod config;
mod error;
mod handlers;
mod models;
mod routes;
mod state;
mod ws;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── Load .env file (development only) ──
    dotenvy::dotenv().ok();

    // ── Initialize structured logging ──
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "salotto_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // ── Load typed configuration ──
    let config = config::Config::from_env().expect("Failed to load configuration");
    tracing::info!(
        host = %config.host,
        port = %config.port,
        "Starting Salotto backend"
    );

    // ── Initialize application state ──
    let app_state = state::AppState::new(config.clone()).await?;

    // ── Run database migrations ──
    tracing::info!("Running database migrations…");
    sqlx::migrate!("./migrations")
        .run(&app_state.db)
        .await
        .expect("Failed to run database migrations");
    tracing::info!("Migrations completed successfully");

    // ── Build the router ──
    let app = routes::create_router(app_state);

    // ── Start serving ──
    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .expect("Invalid bind address");

    tracing::info!(%addr, "Salotto is ready — listening for connections");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

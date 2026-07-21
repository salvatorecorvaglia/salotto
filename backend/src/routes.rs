use axum::{
    http::{header, Method},
    routing::{get, patch, post, delete},
    Router,
};
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    trace::TraceLayer,
};

use crate::handlers;
use crate::state::AppState;
use crate::ws;

/// Assemble the complete Axum router with all route groups and middleware.
pub fn create_router(state: AppState) -> Router {
    // ── Public routes (no auth required) ──
    let auth_routes = Router::new()
        .route("/register", post(handlers::auth::register))
        .route("/login", post(handlers::auth::login))
        .route("/refresh", post(handlers::auth::refresh))
        .route("/logout", post(handlers::auth::logout));

    // ── Protected routes (auth required) ──
    let user_routes = Router::new()
        .route("/me", get(handlers::users::get_me).patch(handlers::users::update_me))
        .route("/{user_id}", get(handlers::users::get_user));

    let workspace_routes = Router::new()
        .route("/", post(handlers::workspaces::create).get(handlers::workspaces::list_mine))
        .route("/{workspace_id}", get(handlers::workspaces::get_by_id))
        .route("/{workspace_id}/members", post(handlers::workspaces::add_member))
        .route(
            "/{workspace_id}/members/{user_id}",
            delete(handlers::workspaces::remove_member),
        )
        .route(
            "/{workspace_id}/channels",
            post(handlers::channels::create).get(handlers::channels::list_for_workspace),
        );

    let channel_routes = Router::new()
        .route("/{channel_id}", get(handlers::channels::get_by_id).patch(handlers::channels::update))
        .route("/{channel_id}/join", post(handlers::channels::join))
        .route("/{channel_id}/leave", post(handlers::channels::leave))
        .route(
            "/{channel_id}/messages",
            post(handlers::messages::send).get(handlers::messages::list),
        );

    let message_routes = Router::new()
        .route("/{message_id}", patch(handlers::messages::edit).delete(handlers::messages::delete_msg));

    // ── Assemble the full API ──
    let api = Router::new()
        .nest("/auth", auth_routes)
        .nest("/users", user_routes)
        .nest("/workspaces", workspace_routes)
        .nest("/channels", channel_routes)
        .nest("/messages", message_routes);

    // ── Root router with middleware ──
    Router::new()
        .route("/health", get(health_check))
        .route("/ws", get(ws::handler::ws_upgrade))
        .nest("/api/v1", api)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PATCH,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
                .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]),
        )
        .with_state(state)
}

/// Simple health check endpoint.
async fn health_check() -> &'static str {
    "OK"
}

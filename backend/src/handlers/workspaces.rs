use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    auth::middleware::AuthUser,
    error::{AppError, AppResult},
    models::workspace::{
        AddMemberPayload, CreateWorkspacePayload, Workspace, WorkspaceMember, WorkspaceRole,
    },
    state::AppState,
};

/// POST /api/v1/workspaces
///
/// Creates a new workspace. The creator becomes the owner.
pub async fn create(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(payload): Json<CreateWorkspacePayload>,
) -> AppResult<(StatusCode, Json<Workspace>)> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let workspace_id = Uuid::now_v7();

    // Start a database transaction
    let mut tx = state.db.begin().await?;

    // Create the workspace
    let workspace = sqlx::query_as::<_, Workspace>(
        r#"
        INSERT INTO workspaces (id, name, slug, description, owner_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(workspace_id)
    .bind(&payload.name)
    .bind(&payload.slug)
    .bind(&payload.description)
    .bind(auth.user_id)
    .fetch_one(&mut *tx)
    .await?;

    // Add the creator as the workspace owner
    sqlx::query(
        r#"
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(workspace_id)
    .bind(auth.user_id)
    .bind(WorkspaceRole::Owner.as_str())
    .execute(&mut *tx)
    .await?;

    // Auto-create a #general channel
    let channel_id = Uuid::now_v7();
    sqlx::query(
        r#"
        INSERT INTO channels (id, workspace_id, name, kind, topic, created_by)
        VALUES ($1, $2, 'general', 'text', 'General discussion', $3)
        "#,
    )
    .bind(channel_id)
    .bind(workspace_id)
    .bind(auth.user_id)
    .execute(&mut *tx)
    .await?;

    // Auto-join the creator to #general
    sqlx::query("INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)")
        .bind(channel_id)
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok((StatusCode::CREATED, Json(workspace)))
}

/// GET /api/v1/workspaces
///
/// Lists all workspaces the authenticated user is a member of.
pub async fn list_mine(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<Json<Vec<Workspace>>> {
    let workspaces = sqlx::query_as::<_, Workspace>(
        r#"
        SELECT w.*
        FROM workspaces w
        INNER JOIN workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = $1
        ORDER BY w.created_at DESC
        "#,
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(workspaces))
}

/// GET /api/v1/workspaces/:workspace_id
///
/// Returns a single workspace. Requires the user to be a member.
pub async fn get_by_id(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
) -> AppResult<Json<Workspace>> {
    // Verify membership
    require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let workspace = sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces WHERE id = $1")
        .bind(workspace_id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(workspace))
}

/// POST /api/v1/workspaces/:workspace_id/members
///
/// Adds a member to the workspace. Requires admin or above.
pub async fn add_member(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    Json(payload): Json<AddMemberPayload>,
) -> AppResult<StatusCode> {
    // Check that the requester is an admin or owner
    let member = require_workspace_member(&state, workspace_id, auth.user_id).await?;
    let role = WorkspaceRole::from_str(&member.role)
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Unknown role: {}", member.role)))?;
    if !role.is_admin_or_above() {
        return Err(AppError::Forbidden(
            "Only admins and owners can add members".into(),
        ));
    }

    // Validate the target role
    let new_role = payload.role.as_deref().unwrap_or("member");
    if WorkspaceRole::from_str(new_role).is_none() {
        return Err(AppError::BadRequest(format!("Invalid role: {}", new_role)));
    }

    // Prevent adding with 'owner' role
    if new_role == "owner" {
        return Err(AppError::Forbidden(
            "Cannot assign the owner role directly".into(),
        ));
    }

    // Verify the target user exists
    let user_exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
            .bind(payload.user_id)
            .fetch_one(&state.db)
            .await?;

    if !user_exists {
        return Err(AppError::NotFound("User not found".into()));
    }

    // Add the member
    sqlx::query(
        r#"
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, user_id) DO NOTHING
        "#,
    )
    .bind(workspace_id)
    .bind(payload.user_id)
    .bind(new_role)
    .execute(&state.db)
    .await?;

    // Auto-join public channels
    let public_channels = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM channels WHERE workspace_id = $1 AND is_private = FALSE",
    )
    .bind(workspace_id)
    .fetch_all(&state.db)
    .await?;

    for channel_id in public_channels {
        sqlx::query(
            r#"
            INSERT INTO channel_members (channel_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(channel_id)
        .bind(payload.user_id)
        .execute(&state.db)
        .await?;
    }

    Ok(StatusCode::CREATED)
}

/// DELETE /api/v1/workspaces/:workspace_id/members/:user_id
///
/// Removes a member from the workspace. Requires admin or above.
/// The workspace owner cannot be removed.
pub async fn remove_member(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((workspace_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    // Check requester is admin+
    let member = require_workspace_member(&state, workspace_id, auth.user_id).await?;
    let role = WorkspaceRole::from_str(&member.role)
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Unknown role: {}", member.role)))?;

    // Users can remove themselves; otherwise must be admin+
    if auth.user_id != target_user_id && !role.is_admin_or_above() {
        return Err(AppError::Forbidden(
            "Only admins and owners can remove members".into(),
        ));
    }

    // Cannot remove the workspace owner
    let workspace = sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces WHERE id = $1")
        .bind(workspace_id)
        .fetch_one(&state.db)
        .await?;

    if target_user_id == workspace.owner_id {
        return Err(AppError::Forbidden(
            "Cannot remove the workspace owner".into(),
        ));
    }

    // Remove from all channels in this workspace first
    sqlx::query(
        r#"
        DELETE FROM channel_members
        WHERE user_id = $1
        AND channel_id IN (SELECT id FROM channels WHERE workspace_id = $2)
        "#,
    )
    .bind(target_user_id)
    .bind(workspace_id)
    .execute(&state.db)
    .await?;

    // Remove workspace membership
    sqlx::query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2")
        .bind(workspace_id)
        .bind(target_user_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/workspaces/{workspace_id}/members
///
/// Lists all member profiles in a workspace.
pub async fn list_members(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
) -> AppResult<Json<Vec<crate::models::user::UserProfile>>> {
    require_workspace_member(&state, workspace_id, auth.user_id).await?;

    let members = sqlx::query_as::<_, crate::models::user::UserProfile>(
        r#"
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen_at
        FROM users u
        INNER JOIN workspace_members wm ON wm.user_id = u.id
        WHERE wm.workspace_id = $1
        ORDER BY u.display_name ASC
        "#,
    )
    .bind(workspace_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(members))
}

#[derive(serde::Deserialize)]
pub struct JoinInvitePayload {
    pub code: String,
}

#[derive(serde::Deserialize)]
pub struct UpdateRolePayload {
    pub role: String,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct InviteResponse {
    pub code: String,
    pub workspace_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// POST /api/v1/workspaces/{workspace_id}/invites
pub async fn create_invite(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
) -> AppResult<Json<InviteResponse>> {
    // Verify requester is an admin or owner of workspace
    let member = require_workspace_member(&state, workspace_id, auth.user_id).await?;
    if member.role != "admin" && member.role != "owner" {
        return Err(AppError::Forbidden(
            "Only workspace admins or owners can create invite codes".into(),
        ));
    }

    // Generate a simple secure code
    let code = format!(
        "invite_{}",
        &Uuid::now_v7().to_string().replace("-", "")[..12]
    );

    let invite = sqlx::query_as::<_, InviteResponse>(
        r#"
        INSERT INTO workspace_invites (code, workspace_id, created_by)
        VALUES ($1, $2, $3)
        RETURNING code, workspace_id, created_at
        "#,
    )
    .bind(&code)
    .bind(workspace_id)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(invite))
}

/// POST /api/v1/workspaces/join
pub async fn join_workspace_by_invite(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(payload): Json<JoinInvitePayload>,
) -> AppResult<Json<Workspace>> {
    use sqlx::Row;

    // Find the invite code
    let invite =
        sqlx::query("SELECT workspace_id, max_uses, uses FROM workspace_invites WHERE code = $1")
            .bind(&payload.code)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound("Invite code not found or invalid".into()))?;

    let workspace_id: Uuid = invite.try_get("workspace_id")?;
    let max_uses: Option<i32> = invite.try_get("max_uses")?;
    let uses: i32 = invite.try_get("uses")?;

    if let Some(max) = max_uses {
        if uses >= max {
            return Err(AppError::BadRequest(
                "This invite link has reached its maximum usage limit".into(),
            ));
        }
    }

    // Add user as member to workspace (on conflict ignore or return ok if already member)
    sqlx::query(
        r#"
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, 'member')
        ON CONFLICT (workspace_id, user_id) DO NOTHING
        "#,
    )
    .bind(workspace_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    // Auto-join #general channel (find general channel in workspace)
    if let Ok(general_channel_id) = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM channels WHERE workspace_id = $1 AND name = 'general' LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_one(&state.db)
    .await
    {
        sqlx::query(
            "INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
        )
        .bind(general_channel_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    }

    // Update uses count
    sqlx::query("UPDATE workspace_invites SET uses = uses + 1 WHERE code = $1")
        .bind(&payload.code)
        .execute(&state.db)
        .await?;

    // Return the joined workspace details
    let workspace = sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces WHERE id = $1")
        .bind(workspace_id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(workspace))
}

/// PATCH /api/v1/workspaces/{workspace_id}/members/{user_id}
pub async fn update_member_role(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((workspace_id, target_user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateRolePayload>,
) -> AppResult<StatusCode> {
    // Validate role target
    if payload.role != "admin" && payload.role != "member" {
        return Err(AppError::BadRequest(
            "Invalid role. Role must be 'admin' or 'member'".into(),
        ));
    }

    // Verify requester is the workspace owner
    let requester = require_workspace_member(&state, workspace_id, auth.user_id).await?;
    if requester.role != "owner" {
        return Err(AppError::Forbidden(
            "Only the workspace owner can change member roles".into(),
        ));
    }

    // Make sure we're not modifying the owner's role
    let target = require_workspace_member(&state, workspace_id, target_user_id).await?;
    if target.role == "owner" {
        return Err(AppError::Forbidden(
            "The owner's role cannot be modified".into(),
        ));
    }

    // Update the role in workspace_members
    sqlx::query("UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2")
        .bind(workspace_id)
        .bind(target_user_id)
        .bind(&payload.role)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Helpers ──

/// Verify that a user is a member of the given workspace.
/// Returns the membership record, or a Forbidden error.
pub async fn require_workspace_member(
    state: &AppState,
    workspace_id: Uuid,
    user_id: Uuid,
) -> AppResult<WorkspaceMember> {
    sqlx::query_as::<_, WorkspaceMember>(
        "SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Forbidden("Not a member of this workspace".into()))
}

-- ============================================================
-- Salotto — Initial Database Schema
-- Migration 001 (UP)
--
-- All primary keys use UUIDv7 (time-ordered), generated at
-- the application level in Rust via uuid::Uuid::now_v7().
-- This prevents B-tree index fragmentation on high-volume
-- inserts compared to random UUIDv4.
-- ============================================================

-- ──────────────────────────────────────────────
-- Extensions
-- ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────
-- Users
-- ──────────────────────────────────────────────
CREATE TABLE users (
    id            UUID        PRIMARY KEY,
    username      VARCHAR(32) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    display_name  VARCHAR(64) NOT NULL,
    password_hash TEXT        NOT NULL,
    avatar_url    TEXT,
    status        VARCHAR(16) NOT NULL DEFAULT 'offline',
    last_seen_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email    UNIQUE (email)
);

-- ──────────────────────────────────────────────
-- Workspaces
-- ──────────────────────────────────────────────
CREATE TABLE workspaces (
    id          UUID        PRIMARY KEY,
    name        VARCHAR(64) NOT NULL,
    slug        VARCHAR(64) NOT NULL,
    description TEXT,
    owner_id    UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_workspaces_slug UNIQUE (slug)
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);

-- ──────────────────────────────────────────────
-- Workspace Members (join table with role)
-- Roles: owner, admin, member, guest
-- ──────────────────────────────────────────────
CREATE TABLE workspace_members (
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    role         VARCHAR(16) NOT NULL DEFAULT 'member',
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- ──────────────────────────────────────────────
-- Channels
-- Kinds: text, voice, announcement
-- ──────────────────────────────────────────────
CREATE TABLE channels (
    id           UUID        PRIMARY KEY,
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         VARCHAR(64) NOT NULL,
    kind         VARCHAR(16) NOT NULL DEFAULT 'text',
    topic        TEXT,
    is_private   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by   UUID        NOT NULL REFERENCES users(id)      ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_channels_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX idx_channels_workspace ON channels(workspace_id);

-- ──────────────────────────────────────────────
-- Channel Members
-- ──────────────────────────────────────────────
CREATE TABLE channel_members (
    channel_id   UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,

    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX idx_channel_members_user ON channel_members(user_id);

-- ──────────────────────────────────────────────
-- Messages
-- parent_id enables threaded conversations
-- attachments is a JSONB array of file metadata
-- ──────────────────────────────────────────────
CREATE TABLE messages (
    id          UUID        PRIMARY KEY,
    channel_id  UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id   UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    parent_id   UUID        REFERENCES messages(id)          ON DELETE SET NULL,
    content     TEXT        NOT NULL,
    attachments JSONB       NOT NULL DEFAULT '[]'::jsonb,
    is_edited   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for cursor-paginated message queries (newest first)
-- UUIDv7 IDs are time-ordered, so (channel_id, id DESC) is equivalent
-- to (channel_id, created_at DESC) but faster for cursor pagination.
CREATE INDEX idx_messages_channel_id_desc ON messages(channel_id, id DESC);
CREATE INDEX idx_messages_sender          ON messages(sender_id);
CREATE INDEX idx_messages_parent          ON messages(parent_id) WHERE parent_id IS NOT NULL;

-- ──────────────────────────────────────────────
-- Direct Conversations (1:1 and group DMs)
-- Separate from channels for cleaner semantics.
-- ──────────────────────────────────────────────
CREATE TABLE direct_conversations (
    id           UUID        PRIMARY KEY,
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_direct_conversations_workspace ON direct_conversations(workspace_id);

-- ──────────────────────────────────────────────
-- Direct Conversation Members
-- ──────────────────────────────────────────────
CREATE TABLE direct_conversation_members (
    conversation_id UUID NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id)                ON DELETE CASCADE,

    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_dc_members_user ON direct_conversation_members(user_id);

-- ──────────────────────────────────────────────
-- Refresh Tokens
-- Stored as SHA-256 hashes for security.
-- ──────────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id         UUID        PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

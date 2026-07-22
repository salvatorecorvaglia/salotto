-- Migration 0002: Files authorization table and Full-Text Search vector index

-- 1. Create files metadata table for secure workspace file access
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES direct_conversations(id) ON DELETE SET NULL,
    uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_workspace_id ON files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_files_key ON files(key);

-- 2. Add tsvector generated column on messages for fast full-text search
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON messages USING GIN(search_vector);

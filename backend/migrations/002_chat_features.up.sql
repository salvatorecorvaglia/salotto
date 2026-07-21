-- ============================================================
-- Salotto — Phase 3 Database Schema additions
-- Migration 002 (UP)
-- ============================================================

-- 1. Support Direct Messages in the messages table
ALTER TABLE messages ALTER COLUMN channel_id DROP NOT NULL;

ALTER TABLE messages ADD COLUMN conversation_id UUID REFERENCES direct_conversations(id) ON DELETE CASCADE;

-- Ensure exactly one of channel_id or conversation_id is specified
ALTER TABLE messages ADD CONSTRAINT chk_messages_destination CHECK (
    (channel_id IS NOT NULL AND conversation_id IS NULL) OR
    (channel_id IS NULL AND conversation_id IS NOT NULL)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, id DESC);

-- 2. Create message_reactions table for emojis
CREATE TABLE message_reactions (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON message_reactions(message_id);

-- ============================================================
-- Salotto — Phase 3 Database Schema additions
-- Migration 002 (DOWN / Rollback)
-- ============================================================

DROP TABLE IF EXISTS message_reactions CASCADE;

DROP INDEX IF EXISTS idx_messages_conversation;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS chk_messages_destination;
ALTER TABLE messages DROP COLUMN IF EXISTS conversation_id;

-- Before setting NOT NULL, ensure there are no messages with NULL channel_id.
-- (This rollback would fail if there are active DMs, which is correct behavior)
ALTER TABLE messages ALTER COLUMN channel_id SET NOT NULL;

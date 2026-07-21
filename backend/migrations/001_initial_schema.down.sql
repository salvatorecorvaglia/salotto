-- ============================================================
-- Salotto — Initial Database Schema
-- Migration 001 (DOWN / Rollback)
--
-- Drops all tables in reverse dependency order.
-- ============================================================

DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS direct_conversation_members CASCADE;
DROP TABLE IF EXISTS direct_conversations CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS channel_members CASCADE;
DROP TABLE IF EXISTS channels CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP EXTENSION IF EXISTS "pgcrypto";

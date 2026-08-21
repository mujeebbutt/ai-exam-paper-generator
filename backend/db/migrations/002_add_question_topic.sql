-- Migration 002: Weak-topic detection (Phase 3)
-- Adds a topic field to `questions`. There's no per-question topic classification anywhere in
-- the generation pipeline, so this is populated from the parent Exam's `subject` at
-- materialization time (see services/attempt_service.py) — the closest existing "topic" signal
-- without building a whole new AI classification step the brief didn't ask for.

ALTER TABLE questions ADD COLUMN topic TEXT;
CREATE INDEX IF NOT EXISTS ix_questions_topic ON questions(topic);

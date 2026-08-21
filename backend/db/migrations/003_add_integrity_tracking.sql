-- Migration 003: Anti-cheat / integrity logging (Phase 4)

-- 1. Tab-switch / focus-loss event log, one row per occurrence.
CREATE TABLE IF NOT EXISTS integrity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES student_attempts(id),
    event_type VARCHAR NOT NULL, -- "tab_switch" | "focus_loss"
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_integrity_events_attempt_id ON integrity_events(attempt_id);

-- 2. Suspiciously-fast-submission flag on the attempt itself.
ALTER TABLE student_attempts ADD COLUMN flagged_fast_submission BOOLEAN DEFAULT 0;

-- 3. Per-question time spent, on the existing StudentAnswer row (Phase 1).
ALTER TABLE student_answers ADD COLUMN time_spent_seconds FLOAT;

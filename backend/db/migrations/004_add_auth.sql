-- Migration 004: Real authentication (Phase 5)
-- The `users` table already existed as dead scaffolding (never referenced anywhere in the
-- backend until now) with id/username/email/hashed_password/role. This adds the fields an
-- actual registration flow needs — additive only, existing columns are left as-is.

ALTER TABLE users ADD COLUMN full_name VARCHAR;
ALTER TABLE users ADD COLUMN grade VARCHAR;       -- student-only ("Grade 10", "Freshman", etc.)
ALTER TABLE users ADD COLUMN subject VARCHAR;     -- teacher-only (subject they teach)
ALTER TABLE users ADD COLUMN google_uid VARCHAR;  -- set once real Google Sign-In is wired up (Firebase UID)
ALTER TABLE users ADD COLUMN created_at DATETIME;

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_uid ON users(google_uid);

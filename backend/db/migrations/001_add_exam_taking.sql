-- Migration 001: Exam-taking and AI grading system
-- This project has no Alembic; migrations are plain SQL applied once via
-- backend/db/migrations/run_migrations.py. New tables are additionally
-- covered by Base.metadata.create_all() on every app startup (main.py),
-- but ALTER TABLE on the existing `questions` table needs to run explicitly
-- since create_all() never modifies tables that already exist.

-- 1. Extend questions with exam_id (materialization link) and marking_scheme
--    (Long-question rubric notes, used as AI grading context).
ALTER TABLE questions ADD COLUMN exam_id INTEGER REFERENCES exams(id);
ALTER TABLE questions ADD COLUMN marking_scheme TEXT;

CREATE INDEX IF NOT EXISTS ix_questions_exam_id ON questions(exam_id);

-- 2. StudentAttempt: one row per student's attempt at an exam.
CREATE TABLE IF NOT EXISTS student_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    student_id VARCHAR NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    status VARCHAR DEFAULT 'in_progress',
    total_score FLOAT,
    max_score FLOAT
);
CREATE INDEX IF NOT EXISTS ix_student_attempts_exam_id ON student_attempts(exam_id);
CREATE INDEX IF NOT EXISTS ix_student_attempts_student_id ON student_attempts(student_id);

-- 3. StudentAnswer: one row per question per attempt.
CREATE TABLE IF NOT EXISTS student_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES student_attempts(id),
    question_id INTEGER NOT NULL REFERENCES questions(id),
    student_response TEXT,
    is_correct BOOLEAN,
    ai_score FLOAT,
    ai_feedback JSON,
    strictness_used VARCHAR,
    grammar_check_enabled BOOLEAN DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_student_answers_attempt_id ON student_answers(attempt_id);

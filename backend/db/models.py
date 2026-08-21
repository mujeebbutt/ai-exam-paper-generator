from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from db.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=True) # legacy/unused column, kept for compat — full_name/email are the real identity fields now
    full_name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True) # nullable: a Google-auth-only user has no local password
    role = Column(String, default="student") # "teacher" | "student"
    grade = Column(String, nullable=True)   # student-only, e.g. "Grade 10"
    subject = Column(String, nullable=True) # teacher-only, subject they teach
    google_uid = Column(String, nullable=True, unique=True, index=True) # Firebase UID, once Google Sign-In is wired up
    created_at = Column(DateTime, default=datetime.utcnow)

    # Consent tracking (Terms & Conditions / Privacy Policy) — recorded at registration time.
    # terms_version is the legal-copy version they agreed to (see frontend/terms.html's "Last
    # Updated" date), so a future re-consent flow can compare it against the current version.
    terms_accepted = Column(Boolean, default=False)
    terms_accepted_at = Column(DateTime, nullable=True)
    terms_version = Column(String, nullable=True)

    questions = relationship("Question", back_populates="owner")
    exams = relationship("Exam", back_populates="owner")

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=True, index=True) # Set when a question is materialized from an Exam's questions_data snapshot for exam-taking
    session_id = Column(String, index=True)
    text = Column(Text, nullable=False)
    type = Column(String) # MCQ, Short, Long
    options = Column(JSON, nullable=True) # JSON list for MCQs
    answer = Column(Text)
    explanation = Column(Text)
    marking_scheme = Column(Text, nullable=True) # Rubric notes for Long questions, used as AI grading context
    topic = Column(String, nullable=True, index=True) # Weak-topic grouping key; set from Exam.subject at materialization (no per-question classification exists)
    difficulty = Column(String) # Easy, Medium, Hard
    bloom_level = Column(String) # Remember, Understand, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="questions")
    exam = relationship("Exam")

class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    session_id = Column(String, index=True)
    title = Column(String)
    subject = Column(String)
    date = Column(String)
    total_marks = Column(Integer)
    time_limit = Column(String)
    passing_percentage = Column(Integer)
    mcq_marks = Column(Integer)
    short_marks = Column(Integer)
    long_marks = Column(Integer)
    branding = Column(JSON) # Store uni, dept, logo_path
    student_info = Column(JSON) # Store enabled, show_name, show_roll_no
    questions_data = Column(JSON) # List of question IDs or snapshot
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="exams")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="active") # active, completed, expired
    created_at = Column(DateTime, default=datetime.utcnow)

class StudentAttempt(Base):
    __tablename__ = "student_attempts"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False, index=True)
    student_id = Column(String, index=True, nullable=False) # Free-text student identifier or session_id; no auth system exists yet
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    status = Column(String, default="in_progress") # in_progress, submitted, graded
    total_score = Column(Float, nullable=True)
    max_score = Column(Float, nullable=True)
    flagged_fast_submission = Column(Boolean, default=False) # set at submit time — see AttemptService.is_fast_submission

    exam = relationship("Exam")
    answers = relationship("StudentAnswer", back_populates="attempt", cascade="all, delete-orphan")
    integrity_events = relationship("IntegrityEvent", back_populates="attempt", cascade="all, delete-orphan")

class StudentAnswer(Base):
    __tablename__ = "student_answers"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("student_attempts.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    student_response = Column(Text)
    is_correct = Column(Boolean, nullable=True) # MCQ only, exact-match auto-grade
    ai_score = Column(Float, nullable=True)
    ai_feedback = Column(JSON, nullable=True) # {feedback, missing, grammar_notes?, needs_manual_review?}
    strictness_used = Column(String, nullable=True) # easy, medium, hard
    grammar_check_enabled = Column(Boolean, default=False)
    time_spent_seconds = Column(Float, nullable=True) # approximate — time between first and last interaction with this question (single-scroll UI, not one-question-per-page)

    attempt = relationship("StudentAttempt", back_populates="answers")
    question = relationship("Question")

class IntegrityEvent(Base):
    __tablename__ = "integrity_events"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("student_attempts.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False) # "tab_switch" | "focus_loss"
    timestamp = Column(DateTime, default=datetime.utcnow)

    attempt = relationship("StudentAttempt", back_populates="integrity_events")

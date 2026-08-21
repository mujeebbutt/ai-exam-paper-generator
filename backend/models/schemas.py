from pydantic import BaseModel, EmailStr
from typing import List, Optional, Any
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    role: str
    class Config:
        from_attributes = True

# Branding Schemas
class BrandingInfo(BaseModel):
    uni: Optional[str] = ""
    dept: Optional[str] = ""
    logo_path: Optional[str] = None
    enable_watermark: bool = False
    watermark_text: Optional[str] = "CONFIDENTIAL"

class StudentInfo(BaseModel):
    enabled: bool = True
    show_name: bool = True
    show_roll_no: bool = True
    show_class: bool = True
    show_date: bool = True
    show_section: bool = True
    show_bloom_tags: bool = True
    multi_column_mcqs: bool = False

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Question Schemas
class QuestionBase(BaseModel):
    text: str
    type: str # MCQ, Short, Long
    options: Optional[List[str]] = None
    answer: str
    explanation: Optional[str] = None
    difficulty: str
    bloom_level: Optional[str] = None

class QuestionCreate(QuestionBase):
    session_id: str

class Question(QuestionBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True

# Exam Schemas
class SectionConfig(BaseModel):
    type: str
    count: int
    marks: int
    description: Optional[str] = None

# Exam Schemas
class ExamBase(BaseModel):
    title: str
    subject: str
    date: str
    total_marks: int
    session_id: Optional[str] = None
    questions_data: Any # Can be list of dicts or list of IDs
    exam_title: Optional[str] = "Professional Assessment"
    time_limit: Optional[str] = "2 Hours"
    passing_percentage: Optional[int] = 40
    mcq_marks: Optional[int] = 1
    short_marks: Optional[int] = 4
    long_marks: Optional[int] = 10
    branding: Optional[BrandingInfo] = None
    student_info: Optional[StudentInfo] = None

class ExamCreate(ExamBase):
    pass

class Exam(ExamBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True

# Generation Request
class GenerateRequest(BaseModel):
    session_id: str
    sections: List[SectionConfig]
    difficulty: str = "medium"
    topic: Optional[str] = None
    time_limit: str = "2 Hours"
    passing_percentage: int = 40
    exam_title: str = "Final Examination"
    branding: Optional[BrandingInfo] = None
    student_info: Optional[StudentInfo] = None
    # Used by POST /api/exams/{exam_id}/regenerate (routers/generate.py) to steer genuinely new
    # questions instead of reworded duplicates, and to bypass the session-level generation cache
    # (which would otherwise just hand back the original exam unchanged).
    avoid_questions: Optional[List[str]] = None
    force_regenerate: bool = False

# --- Exam-Taking & AI Grading Schemas ---

class AttemptStartRequest(BaseModel):
    exam_id: int
    student_id: str

class AttemptQuestionOut(BaseModel):
    """Question shape shown to a student while taking the exam — no answer key fields."""
    id: int
    type: str
    question: str
    options: Optional[List[str]] = None
    marks: int
    bloom_level: Optional[str] = None

class AttemptStartResponse(BaseModel):
    attempt_id: int
    exam_id: int
    exam_title: str
    subject: Optional[str] = None
    time_limit: Optional[str] = None
    total_marks: Optional[int] = None
    questions: List[AttemptQuestionOut]

class AnswerSubmit(BaseModel):
    question_id: int
    response: str
    # Approximate — time between first and last interaction with this question's input on a
    # single-scroll exam page (see attempt.js). Piggybacks on the existing submit call per spec.
    time_spent_seconds: Optional[float] = None

class AttemptSubmitRequest(BaseModel):
    answers: List[AnswerSubmit]

class AttemptSubmitResponse(BaseModel):
    attempt_id: int
    status: str
    mcq_graded: int
    pending_ai_grading: int

class AttemptGradeRequest(BaseModel):
    strictness: str = "medium" # easy, medium, hard
    grammar_check: bool = False

class RubricCriterion(BaseModel):
    criterion: str
    matched: bool
    note: Optional[str] = None

class AIFeedback(BaseModel):
    feedback: Optional[str] = None
    missing: Optional[str] = None
    rubric_criteria: Optional[List[RubricCriterion]] = None
    content_score: Optional[float] = None    # score from rubric/content matching only, before grammar
    grammar_deduction: Optional[float] = None # points deducted for grammar, shown as its own line item — never folded into content_score
    grammar_notes: Optional[str] = None
    needs_manual_review: Optional[bool] = False
    error: Optional[str] = None

class StudentAnswerOut(BaseModel):
    id: int
    question_id: int
    question_text: str
    question_type: str
    marks: int
    student_response: Optional[str] = None
    is_correct: Optional[bool] = None
    ai_score: Optional[float] = None
    ai_feedback: Optional[AIFeedback] = None
    strictness_used: Optional[str] = None
    grammar_check_enabled: bool = False
    # Model/ideal answer for comparison — only ever populated by the backend when the parent
    # attempt's status is "graded" (see routers/attempts.py::_build_answer_out), so this can
    # never leak the answer key through this schema before grading is done.
    ideal_answer: Optional[str] = None
    class Config:
        from_attributes = True

class AttemptDetail(BaseModel):
    id: int
    exam_id: int
    exam_title: Optional[str] = None
    student_id: str
    status: str
    started_at: datetime
    submitted_at: Optional[datetime] = None
    total_score: Optional[float] = None
    max_score: Optional[float] = None
    answers: List[StudentAnswerOut]
    class Config:
        from_attributes = True

class AttemptSummary(BaseModel):
    id: int
    exam_id: int
    exam_title: Optional[str] = None
    subject: Optional[str] = None
    status: str
    total_score: Optional[float] = None
    max_score: Optional[float] = None
    started_at: datetime
    submitted_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Phase 3: Retention & Practice Schemas ---

class WeakTopicOut(BaseModel):
    topic: str
    average_percentage: float
    questions_answered: int
    is_weak: bool

class WeakTopicsResponse(BaseModel):
    student_id: str
    threshold: float
    topics: List[WeakTopicOut]

# --- Phase 4: Anti-Cheat & Integrity Logging Schemas ---

class IntegrityEventCreate(BaseModel):
    event_type: str # "tab_switch" | "focus_loss"

class IntegrityEventOut(BaseModel):
    id: int
    event_type: str
    timestamp: datetime
    class Config:
        from_attributes = True

class QuestionTimeOut(BaseModel):
    question_id: int
    question_text: str
    question_type: str
    time_spent_seconds: Optional[float] = None
    is_outlier_fast: bool = False # answered unusually fast for its question type — see IntegrityService

class AttemptIntegritySummary(BaseModel):
    """
    Admin/teacher-only view — never surfaced through any student-facing endpoint
    (AttemptDetail/AttemptSummary/StudentAnswerOut deliberately don't carry these fields).
    """
    attempt_id: int
    student_id: str
    exam_id: int
    exam_title: Optional[str] = None
    status: str
    total_score: Optional[float] = None
    max_score: Optional[float] = None
    started_at: datetime
    submitted_at: Optional[datetime] = None
    tab_switch_count: int
    focus_loss_count: int
    flagged_fast_submission: bool
    question_times: List[QuestionTimeOut]

# --- Phase 5: Authentication & Profile Schemas ---
# (Distinct names from the old dead-scaffolding UserBase/UserCreate/User above, which nothing
# ever used — kept as-is rather than repurposed, to avoid touching unrelated code.)

class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str  # "teacher" | "student"
    grade: Optional[str] = None    # required by the frontend when role == "student"
    subject: Optional[str] = None  # required by the frontend when role == "teacher"
    terms_accepted: bool = False   # must be true — frontend blocks submission too, this is the server-side backstop

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    """Stubbed until real Firebase config is available — see routers/auth.py."""
    id_token: str

class AuthUserOut(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str
    role: str
    grade: Optional[str] = None
    subject: Optional[str] = None
    terms_accepted: bool = False
    terms_version: Optional[str] = None
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUserOut

class ProfileUpdateRequest(BaseModel):
    """Account-tab edits on the Profile page. All fields optional so a partial save (e.g. just
    changing grade) doesn't require resending the rest."""
    full_name: Optional[str] = None
    grade: Optional[str] = None
    subject: Optional[str] = None

class OwnedExamOut(BaseModel):
    id: int
    title: Optional[str] = None
    subject: Optional[str] = None
    date: Optional[str] = None
    total_marks: Optional[int] = None
    created_at: datetime
    question_count: int
    class Config:
        from_attributes = True

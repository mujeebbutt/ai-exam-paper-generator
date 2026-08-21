from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from db.database import get_db
from db import models
from models.schemas import (
    AttemptStartRequest, AttemptStartResponse, AttemptQuestionOut,
    AttemptSubmitRequest, AttemptSubmitResponse,
    AttemptGradeRequest, AttemptDetail, StudentAnswerOut,
    AttemptSummary, WeakTopicsResponse,
    IntegrityEventCreate, IntegrityEventOut, AttemptIntegritySummary,
)
from services.attempt_service import AttemptService
from services.grading_service import GradingService
from services.topic_analytics_service import TopicAnalyticsService
from services.integrity_service import IntegrityService
from datetime import datetime
import logging

router = APIRouter()
grading_service = GradingService()


def _check_mcq_correct(question: models.Question, response: str) -> bool:
    if not response:
        return False
    correct = (question.answer or "").strip().upper()
    resp = response.strip().upper()
    if not correct:
        return False
    if resp == correct:
        return True
    # Tolerate a full option string ("A) Some text") being submitted instead of just the letter
    return len(correct) <= 2 and resp[:1] == correct[:1]


def _build_answer_out(answer: models.StudentAnswer, question: models.Question, exam: models.Exam,
                       attempt_status: str) -> StudentAnswerOut:
    # ideal_answer is the answer key — only ever include it once the attempt is fully graded.
    # Guarded here (not just in the frontend) since this is the one function every attempts
    # endpoint funnels through to build a response.
    is_graded = attempt_status == "graded"
    ideal_answer = question.answer if (is_graded and question.type.lower() in ("short", "long")) else None

    return StudentAnswerOut(
        id=answer.id,
        question_id=question.id,
        question_text=question.text,
        question_type=question.type,
        marks=AttemptService.marks_for_question(exam, question),
        student_response=answer.student_response,
        is_correct=answer.is_correct,
        ai_score=answer.ai_score,
        ai_feedback=answer.ai_feedback,
        strictness_used=answer.strictness_used,
        grammar_check_enabled=answer.grammar_check_enabled,
        ideal_answer=ideal_answer,
    )


@router.post("/attempts/start", response_model=AttemptStartResponse)
def start_attempt(request: AttemptStartRequest, db: Session = Depends(get_db)):
    exam = db.query(models.Exam).filter(models.Exam.id == request.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")

    if not exam.questions_data:
        raise HTTPException(status_code=400, detail="This exam has no questions to attempt.")

    try:
        questions = AttemptService.get_or_create_exam_questions(db, exam)

        attempt = models.StudentAttempt(
            exam_id=exam.id,
            student_id=request.student_id,
            status="in_progress",
            max_score=exam.total_marks,
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)

        out_questions = [
            AttemptQuestionOut(
                id=q.id,
                type=q.type,
                question=q.text,
                options=q.options,
                marks=AttemptService.marks_for_question(exam, q),
                bloom_level=q.bloom_level,
            )
            for q in questions
        ]

        return AttemptStartResponse(
            attempt_id=attempt.id,
            exam_id=exam.id,
            exam_title=exam.title or "Examination",
            subject=exam.subject,
            time_limit=exam.time_limit,
            total_marks=exam.total_marks,
            questions=out_questions,
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to start attempt: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not start the attempt. Please try again.")


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptSubmitResponse)
def submit_attempt(attempt_id: int, request: AttemptSubmitRequest, db: Session = Depends(get_db)):
    attempt = db.query(models.StudentAttempt).filter(models.StudentAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    if attempt.status != "in_progress":
        raise HTTPException(status_code=400, detail=f"This attempt is already '{attempt.status}' and cannot be resubmitted.")

    if not request.answers:
        raise HTTPException(status_code=400, detail="No answers submitted.")

    try:
        exam = attempt.exam
        mcq_graded = 0
        pending_ai = 0
        mcq_score_total = 0.0

        for ans in request.answers:
            question = db.query(models.Question).filter(models.Question.id == ans.question_id).first()
            if not question or question.exam_id != exam.id:
                continue  # ignore answers for questions that don't belong to this exam

            student_answer = models.StudentAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                student_response=ans.response,
                time_spent_seconds=ans.time_spent_seconds,
            )

            if question.type.lower() == "mcq":
                is_correct = _check_mcq_correct(question, ans.response)
                marks = AttemptService.marks_for_question(exam, question)
                student_answer.is_correct = is_correct
                student_answer.ai_score = float(marks) if is_correct else 0.0
                student_answer.ai_feedback = {
                    "feedback": "Correct." if is_correct else f"Incorrect. Correct answer: {question.answer}.",
                    "missing": "" if is_correct else "The correct option.",
                }
                mcq_graded += 1
                mcq_score_total += student_answer.ai_score
            else:
                pending_ai += 1

            db.add(student_answer)

        attempt.status = "submitted"
        attempt.submitted_at = datetime.utcnow()
        attempt.total_score = mcq_score_total  # subjective scores added once /grade runs

        seconds_taken = (attempt.submitted_at - attempt.started_at).total_seconds()
        attempt.flagged_fast_submission = AttemptService.is_fast_submission(
            exam, len(request.answers), seconds_taken
        )

        db.commit()

        return AttemptSubmitResponse(
            attempt_id=attempt.id,
            status=attempt.status,
            mcq_graded=mcq_graded,
            pending_ai_grading=pending_ai,
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to submit attempt {attempt_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not submit the attempt. Please try again.")


@router.post("/attempts/{attempt_id}/grade", response_model=AttemptDetail)
async def grade_attempt(attempt_id: int, request: AttemptGradeRequest, db: Session = Depends(get_db)):
    attempt = db.query(models.StudentAttempt).filter(models.StudentAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    if attempt.status not in ("submitted", "graded"):
        raise HTTPException(status_code=400, detail="This attempt must be submitted before it can be graded.")

    strictness = (request.strictness or "medium").lower()
    if strictness not in ("easy", "medium", "hard"):
        raise HTTPException(status_code=400, detail="strictness must be one of: easy, medium, hard.")

    exam = attempt.exam
    subjective_answers = [
        a for a in attempt.answers
        if a.question.type.lower() in ("short", "long")
    ]

    for answer in subjective_answers:
        question = answer.question
        max_score = AttemptService.marks_for_question(exam, question)

        # Per-question isolation: grade_answer() itself never raises, but wrap anyway
        # so a truly unexpected failure still can't take down the whole batch.
        try:
            result = await grading_service.grade_answer(
                question=question.text,
                model_answer=question.answer,
                student_response=answer.student_response,
                max_score=max_score,
                strictness=strictness,
                grammar_check=request.grammar_check,
                marking_scheme=question.marking_scheme,
            )
        except Exception as e:
            logging.error(f"Unexpected grading failure for question {question.id}: {e}", exc_info=True)
            result = {
                "score": None, "max_score": max_score, "feedback": None, "missing": None,
                "grammar_notes": None, "needs_manual_review": True, "error": str(e),
            }

        answer.ai_score = result.get("score")
        answer.ai_feedback = {
            "feedback": result.get("feedback"),
            "missing": result.get("missing"),
            "rubric_criteria": result.get("rubric_criteria"),
            "content_score": result.get("content_score"),
            "grammar_deduction": result.get("grammar_deduction"),
            "grammar_notes": result.get("grammar_notes"),
            "needs_manual_review": result.get("needs_manual_review", False),
            "error": result.get("error"),
        }
        answer.strictness_used = strictness
        answer.grammar_check_enabled = request.grammar_check
        db.add(answer)

    # Recompute total from every scored answer (MCQ + now-graded subjective).
    # Answers still needing manual review (ai_score is None) are excluded from
    # the running total rather than counted as zero.
    db.flush()
    all_answers = attempt.answers
    attempt.total_score = sum(a.ai_score for a in all_answers if a.ai_score is not None)
    attempt.status = "graded"
    db.commit()
    db.refresh(attempt)

    return AttemptDetail(
        id=attempt.id,
        exam_id=attempt.exam_id,
        exam_title=exam.title,
        student_id=attempt.student_id,
        status=attempt.status,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        total_score=attempt.total_score,
        max_score=attempt.max_score,
        answers=[_build_answer_out(a, a.question, exam, attempt.status) for a in attempt.answers],
    )


@router.get("/attempts/{attempt_id}", response_model=AttemptDetail)
def get_attempt(attempt_id: int, db: Session = Depends(get_db)):
    attempt = db.query(models.StudentAttempt).filter(models.StudentAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")

    exam = attempt.exam
    return AttemptDetail(
        id=attempt.id,
        exam_id=attempt.exam_id,
        exam_title=exam.title if exam else None,
        student_id=attempt.student_id,
        status=attempt.status,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        total_score=attempt.total_score,
        max_score=attempt.max_score,
        answers=[_build_answer_out(a, a.question, exam, attempt.status) for a in attempt.answers],
    )


@router.get("/students/{student_id}/attempts", response_model=list[AttemptSummary])
def get_student_attempts(student_id: str, db: Session = Depends(get_db)):
    attempts = (
        db.query(models.StudentAttempt)
        .filter(models.StudentAttempt.student_id == student_id)
        .order_by(models.StudentAttempt.started_at.desc())
        .all()
    )
    return [
        AttemptSummary(
            id=a.id,
            exam_id=a.exam_id,
            exam_title=a.exam.title if a.exam else None,
            subject=a.exam.subject if a.exam else None,
            status=a.status,
            total_score=a.total_score,
            max_score=a.max_score,
            started_at=a.started_at,
            submitted_at=a.submitted_at,
        )
        for a in attempts
    ]


@router.get("/students/{student_id}/weak-topics", response_model=WeakTopicsResponse)
def get_weak_topics(student_id: str, threshold: float = 60.0, min_samples: int = 2, db: Session = Depends(get_db)):
    if not (0 <= threshold <= 100):
        raise HTTPException(status_code=400, detail="threshold must be between 0 and 100.")
    topics = TopicAnalyticsService.get_weak_topics(db, student_id, threshold=threshold, min_samples=min_samples)
    return WeakTopicsResponse(student_id=student_id, threshold=threshold, topics=topics)


# --- Phase 4: Anti-Cheat & Integrity Logging ---

@router.post("/attempts/{attempt_id}/integrity-events", response_model=IntegrityEventOut)
def log_integrity_event(attempt_id: int, request: IntegrityEventCreate, db: Session = Depends(get_db)):
    attempt = db.query(models.StudentAttempt).filter(models.StudentAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    if request.event_type not in ("tab_switch", "focus_loss"):
        raise HTTPException(status_code=400, detail="event_type must be 'tab_switch' or 'focus_loss'.")

    # Deliberately not gated on attempt.status: a tab-switch in the last moments before the
    # submit response comes back is still a real signal worth keeping.
    event = models.IntegrityEvent(attempt_id=attempt.id, event_type=request.event_type)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/exams/{exam_id}/attempts/integrity", response_model=list[AttemptIntegritySummary])
def get_exam_integrity(exam_id: int, db: Session = Depends(get_db)):
    """
    Admin/teacher-only: every attempt on this exam with its integrity signals (tab-switch/
    focus-loss counts, fast-submission flag, per-question time outliers). Purely informational.
    """
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")

    attempts = (
        db.query(models.StudentAttempt)
        .filter(models.StudentAttempt.exam_id == exam_id)
        .order_by(models.StudentAttempt.started_at.desc())
        .all()
    )
    return [AttemptIntegritySummary(**IntegrityService.build_attempt_summary(db, a)) for a in attempts]

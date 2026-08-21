from sqlalchemy.orm import Session
from db import models
from typing import List, Dict


class IntegrityService:
    """
    Admin/teacher-only analytics over integrity signals collected during an attempt
    (tab-switch/focus-loss events, per-question time). Purely informational — this never
    blocks or auto-penalizes anything; a teacher reviews the summary and decides.
    """

    # A student answering a subjective question in a couple of seconds is a stronger signal
    # than a couple of seconds on an MCQ (quick recognition is normal there) — thresholds are
    # per question type, and deliberately just class constants rather than buried magic numbers.
    OUTLIER_SECONDS_BY_TYPE = {
        "mcq": 2,
        "short": 8,
        "long": 15,
    }

    @classmethod
    def get_event_counts(cls, db: Session, attempt_id: int) -> Dict[str, int]:
        events = (
            db.query(models.IntegrityEvent)
            .filter(models.IntegrityEvent.attempt_id == attempt_id)
            .all()
        )
        counts = {"tab_switch": 0, "focus_loss": 0}
        for e in events:
            counts[e.event_type] = counts.get(e.event_type, 0) + 1
        return counts

    @classmethod
    def get_question_times(cls, attempt: models.StudentAttempt) -> List[Dict]:
        results = []
        for answer in attempt.answers:
            question = answer.question
            q_type = (question.type or "short").lower() if question else "short"
            threshold = cls.OUTLIER_SECONDS_BY_TYPE.get(q_type, cls.OUTLIER_SECONDS_BY_TYPE["short"])
            time_spent = answer.time_spent_seconds
            is_outlier = time_spent is not None and time_spent < threshold
            results.append({
                "question_id": answer.question_id,
                "question_text": question.text if question else "(deleted question)",
                "question_type": q_type,
                "time_spent_seconds": time_spent,
                "is_outlier_fast": is_outlier,
            })
        return results

    @classmethod
    def build_attempt_summary(cls, db: Session, attempt: models.StudentAttempt) -> Dict:
        counts = cls.get_event_counts(db, attempt.id)
        return {
            "attempt_id": attempt.id,
            "student_id": attempt.student_id,
            "exam_id": attempt.exam_id,
            "exam_title": attempt.exam.title if attempt.exam else None,
            "status": attempt.status,
            "total_score": attempt.total_score,
            "max_score": attempt.max_score,
            "started_at": attempt.started_at,
            "submitted_at": attempt.submitted_at,
            "tab_switch_count": counts.get("tab_switch", 0),
            "focus_loss_count": counts.get("focus_loss", 0),
            "flagged_fast_submission": bool(attempt.flagged_fast_submission),
            "question_times": cls.get_question_times(attempt),
        }

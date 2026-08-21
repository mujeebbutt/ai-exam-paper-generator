from sqlalchemy.orm import Session
from db import models
from typing import List, Optional
import re


class AttemptService:
    """
    Bridges Exam.questions_data (a JSON snapshot of question dicts, the format
    the generation pipeline has always used) to real Question rows with a
    proper exam_id FK, so StudentAnswer can reference a real question_id
    instead of a bare array index.
    """

    @staticmethod
    def get_or_create_exam_questions(db: Session, exam: models.Exam) -> List[models.Question]:
        existing = (
            db.query(models.Question)
            .filter(models.Question.exam_id == exam.id)
            .order_by(models.Question.id.asc())
            .all()
        )

        questions_data = exam.questions_data or []
        if existing and len(existing) == len(questions_data):
            return existing

        # Stale/partial materialization (e.g. exam was edited after a previous
        # attempt started) — rebuild from the current snapshot.
        if existing:
            for q in existing:
                db.delete(q)
            db.flush()

        marks_by_type = {
            "mcq": exam.mcq_marks or 1,
            "short": exam.short_marks or 4,
            "long": exam.long_marks or 10,
        }

        created = []
        for q_data in questions_data:
            q_type = (q_data.get("type") or "short").lower()
            question = models.Question(
                exam_id=exam.id,
                session_id=exam.session_id,
                text=q_data.get("question", ""),
                type=q_type,
                options=q_data.get("options"),
                answer=q_data.get("answer", ""),
                explanation=q_data.get("explanation"),
                marking_scheme=q_data.get("marking_scheme"),
                topic=exam.subject,
                difficulty=q_data.get("difficulty"),
                bloom_level=q_data.get("bloom_level"),
            )
            db.add(question)
            created.append((question, marks_by_type.get(q_type, 1)))

        db.flush()  # assign real IDs without committing yet
        for question, _ in created:
            db.refresh(question)

        return [q for q, _ in created]

    @staticmethod
    def marks_for_question(exam: models.Exam, question: models.Question) -> int:
        marks_by_type = {
            "mcq": exam.mcq_marks or 1,
            "short": exam.short_marks or 4,
            "long": exam.long_marks or 10,
        }
        return marks_by_type.get((question.type or "short").lower(), 1)

    # Fast-submission flagging (Phase 4) — configurable, not hardcoded into the check itself.
    FAST_SUBMISSION_THRESHOLD_FRACTION = 0.3  # flag if completed in under 30% of expected time
    DEFAULT_SECONDS_PER_QUESTION = 60         # fallback when the exam has no parseable time_limit

    @staticmethod
    def parse_time_limit_to_seconds(time_limit: Optional[str]) -> Optional[int]:
        """Mirrors attempt.js's parseTimeLimitToSeconds() so both the countdown timer (Phase 3)
        and fast-submission detection (Phase 4) read "2 Hours" / "30 Mins" the same way."""
        if not time_limit:
            return None
        lower = time_limit.lower()
        match = re.search(r"([\d.]+)", lower)
        if not match:
            return None
        num = float(match.group(1))
        if "hour" in lower:
            return round(num * 3600)
        return round(num * 60)  # "Mins" or unlabeled — assume minutes

    @classmethod
    def is_fast_submission(cls, exam: models.Exam, question_count: int, seconds_taken: Optional[float],
                            threshold_fraction: float = None) -> bool:
        if seconds_taken is None or seconds_taken < 0:
            return False
        threshold_fraction = cls.FAST_SUBMISSION_THRESHOLD_FRACTION if threshold_fraction is None else threshold_fraction

        expected_seconds = cls.parse_time_limit_to_seconds(exam.time_limit if exam else None)
        if not expected_seconds:
            expected_seconds = max(question_count, 1) * cls.DEFAULT_SECONDS_PER_QUESTION
        if expected_seconds <= 0:
            return False

        return seconds_taken < (threshold_fraction * expected_seconds)

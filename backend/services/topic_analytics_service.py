from sqlalchemy.orm import Session
from sqlalchemy import func
from db import models
from typing import List, Dict


class TopicAnalyticsService:
    """
    Aggregates a student's graded StudentAnswer history by topic (Question.topic,
    set from the parent Exam's subject at materialization — see attempt_service.py)
    to flag topics the student is consistently weak in.
    """

    DEFAULT_THRESHOLD = 60.0   # percentage; below this a topic is flagged "weak"
    DEFAULT_MIN_SAMPLES = 2    # a single question's score is too noisy to flag a topic on

    @classmethod
    def get_weak_topics(cls, db: Session, student_id: str,
                         threshold: float = None, min_samples: int = None) -> List[Dict]:
        threshold = cls.DEFAULT_THRESHOLD if threshold is None else threshold
        min_samples = cls.DEFAULT_MIN_SAMPLES if min_samples is None else min_samples

        # Join StudentAnswer -> StudentAttempt (this student, graded only) -> Question (topic, marks).
        # ai_score is compared against the question's marks (not exam.total_marks) to get a
        # per-question percentage that's fairly weighted regardless of question type/marks value.
        rows = (
            db.query(
                models.Question.topic,
                models.StudentAnswer.ai_score,
                models.Question.type,
                models.Exam.mcq_marks,
                models.Exam.short_marks,
                models.Exam.long_marks,
            )
            .join(models.StudentAttempt, models.StudentAnswer.attempt_id == models.StudentAttempt.id)
            .join(models.Question, models.StudentAnswer.question_id == models.Question.id)
            .join(models.Exam, models.Question.exam_id == models.Exam.id)
            .filter(models.StudentAttempt.student_id == student_id)
            .filter(models.StudentAttempt.status == "graded")
            .filter(models.StudentAnswer.ai_score.isnot(None))  # excludes needs_manual_review answers
            .all()
        )

        marks_by_type = {"mcq": "mcq_marks", "short": "short_marks", "long": "long_marks"}
        defaults = {"mcq": 1, "short": 4, "long": 10}

        buckets: Dict[str, List[float]] = {}
        for topic, ai_score, q_type, mcq_marks, short_marks, long_marks in rows:
            topic = topic or "General"
            marks_map = {"mcq": mcq_marks, "short": short_marks, "long": long_marks}
            max_score = marks_map.get((q_type or "short").lower()) or defaults.get((q_type or "short").lower(), 1)
            if not max_score:
                continue
            percentage = max(0.0, min(100.0, (ai_score / max_score) * 100))
            buckets.setdefault(topic, []).append(percentage)

        results = []
        for topic, scores in buckets.items():
            avg = sum(scores) / len(scores)
            results.append({
                "topic": topic,
                "average_percentage": round(avg, 1),
                "questions_answered": len(scores),
                "is_weak": len(scores) >= min_samples and avg < threshold,
            })

        # Weakest first, so the dashboard's "Topics to Review" reads worst-to-best at a glance.
        results.sort(key=lambda r: r["average_percentage"])
        return results

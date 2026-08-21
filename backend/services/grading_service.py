import json
import logging
from typing import Optional
from services.llm_service import LLMService
from utils.prompt_templates import PromptTemplates


class GradingService:
    """
    AI grading for subjective (short/long) student answers via Gemini.
    Reuses LLMService for the actual API call (retries, mock mode, JSON parsing
    are already handled there) — this service is only responsible for building
    the grading prompt and turning the response into a safe, structured result.
    """

    def __init__(self):
        self.llm_service = LLMService()

    async def grade_answer(self, question: str, model_answer: Optional[str], student_response: str,
                            max_score: int, strictness: str = "medium", grammar_check: bool = False,
                            marking_scheme: Optional[str] = None) -> dict:
        """
        Grades a single subjective answer. Never raises — on any failure (Gemini
        error, malformed JSON, etc.) returns a fallback result flagged for manual
        review so one bad question can't crash a whole grading batch.
        """
        fallback = {
            "score": None,
            "max_score": max_score,
            "content_score": None,
            "grammar_deduction": None,
            "rubric_criteria": None,
            "feedback": None,
            "missing": None,
            "grammar_notes": None,
            "needs_manual_review": True,
            "error": None,
        }

        if not student_response or not student_response.strip():
            fallback["needs_manual_review"] = False
            fallback["score"] = 0
            fallback["content_score"] = 0
            fallback["feedback"] = "No response was submitted."
            fallback["missing"] = "The entire answer."
            return fallback

        try:
            prompt = PromptTemplates.build_grading_prompt(
                question=question,
                model_answer=model_answer,
                student_response=student_response,
                max_score=max_score,
                strictness=strictness,
                grammar_check=grammar_check,
                marking_scheme=marking_scheme,
            )

            response_text = await self.llm_service.generate_response(
                prompt, PromptTemplates.GRADING_SYSTEM_PROMPT
            )

            if isinstance(response_text, str) and '"error":' in response_text:
                try:
                    error_data = json.loads(response_text)
                    if "error" in error_data:
                        fallback["error"] = error_data["error"]
                        logging.warning(f"Grading failed for question, marked for manual review: {error_data['error']}")
                        return fallback
                except json.JSONDecodeError:
                    pass

            parsed = self.llm_service.parse_json_response(response_text, raw=True)
            data = json.loads(parsed)

            # "content_score" is the new field name; fall back to "score" so this doesn't
            # regress on a response from an older prompt version.
            content_score = data.get("content_score", data.get("score"))
            if content_score is None:
                fallback["error"] = "AI response did not include a score."
                return fallback
            content_score = max(0, min(float(content_score), float(max_score)))

            # The final score is always computed here, deterministically, from content_score
            # minus grammar_deduction — never trusting the AI to have already combined them
            # correctly. This is what keeps the two numbers shown in the UI (content vs.
            # grammar) mathematically consistent with the total.
            grammar_deduction = None
            if grammar_check:
                raw_deduction = data.get("grammar_deduction", 0) or 0
                grammar_deduction = max(0, min(float(raw_deduction), content_score))
            final_score = content_score - (grammar_deduction or 0)
            final_score = max(0, min(final_score, float(max_score)))

            rubric_criteria = data.get("rubric_criteria")
            if not isinstance(rubric_criteria, list):
                rubric_criteria = None

            return {
                "score": final_score,
                "max_score": max_score,
                "content_score": content_score,
                "grammar_deduction": grammar_deduction,
                "rubric_criteria": rubric_criteria,
                "feedback": data.get("feedback", ""),
                "missing": data.get("missing", ""),
                "grammar_notes": data.get("grammar_notes") if grammar_check else None,
                "needs_manual_review": False,
                "error": None,
            }
        except Exception as e:
            logging.error(f"Grading error (marked for manual review): {e}", exc_info=True)
            fallback["error"] = str(e)
            return fallback

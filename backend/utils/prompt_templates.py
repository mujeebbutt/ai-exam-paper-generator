class PromptTemplates:

    SYSTEM_PROMPT = (
        "You are a Senior Academic Examination Expert with 20 years of experience writing board-level and university exam papers.\n\n"
        "YOUR GENERATION PROCESS (follow in order):\n"
        "STEP 1 — CONCEPT MAP: Read the content and list ALL distinct key concepts, theories, definitions, processes, and facts.\n"
        "STEP 2 — CONCEPT ALLOCATION: Assign exactly ONE concept to each question slot. Never reuse a concept.\n"
        "STEP 3 — QUESTION CRAFTING: Write each question testing ONLY its assigned concept.\n"
        "   - MCQs must be scenario-based, comparison-based, or application-based. NOT simple recall ('What is X?').\n"
        "   - Short questions must require a 3–5 sentence analytical response.\n"
        "   - Long questions must require structured, multi-point answers with depth.\n\n"
        "ABSOLUTE RULES:\n"
        "1. ❗ CONTENT LOCKING (CRITICAL): ONLY generate questions from the provided study material. DO NOT use ANY external knowledge, general CS concepts, or assumptions not explicitly present in the file.\n"
        "2. ✗ NEVER repeat a concept, even in different wording.\n"
        "3. ✗ NEVER refer to 'the file', 'the text', 'the document', 'the content', or 'the passage'.\n"
        "4. ✗ NEVER use placeholder phrases: 'Sample', 'Mock', 'Example Question', 'Test Question'.\n"
        "5. ✗ NEVER generate a question if you have run out of unique concepts — return INSUFFICIENT CONTENT instead.\n"
        "6. ✓ ALWAYS write in formal academic language appropriate for university examination papers.\n"
        "7. ✓ ALWAYS generate EXACTLY the requested count. Not one more, not one less.\n"
    )

    CONSOLIDATED_PROMPT_TEMPLATE = """
    Context: {context}
    
    Task: Generate a professional exam paper of {difficulty} difficulty based ONLY on the context above.
    
    Required Structure (STRICT ADHERENCE TO COUNTS):
    {structure_instruction}
    
    Strict Rules:
    1. EXCLUSIVITY: Only generate question types explicitly listed in the structure above.
    2. NON-REPETITION: Each question must test a DIFFERENT concept. Repetition is strictly forbidden.
    3. PROFESSIONALISM: Use formal academic language only. No "According to the file" or "Based on the text".
    4. MCQ QUALITY: MCQs must be scenario, comparison, or application-based. Avoid simple recall questions.
    5. GROUNDING: If the content is insufficient for the requested counts, return ONLY: "INSUFFICIENT CONTENT".
    6. NO PLACEHOLDERS: Strictly forbid phrases like 'Sample Question', 'Question 1', 'Mock MCQ'.
    
    Response Format: 
    Respond with a SINGLE JSON list containing all question objects in order.
    
    Format for each object:
    - MCQ: {{"type": "mcq", "question": "...", "options": ["A)...", "B)...", "C)...", "D)..."], "answer": "A", "explanation": "..."}}
    - Short: {{"type": "short", "question": "...", "answer": "...", "explanation": "..."}}
    - Long: {{"type": "long", "question": "...", "answer": "...", "marking_scheme": "...", "explanation": "..."}}
    """

    @classmethod
    def build_generation_prompt(cls, context: str, difficulty: str, structure_instruction: str,
                                 avoid_questions: list = None) -> str:
        """
        Same CONSOLIDATED_PROMPT_TEMPLATE used for every generation, with an optional appended
        block used by POST /api/exams/{exam_id}/regenerate to force genuinely new questions
        instead of a reshuffle/reword of a previous exam.
        """
        prompt = cls.CONSOLIDATED_PROMPT_TEMPLATE.format(
            context=context, difficulty=difficulty, structure_instruction=structure_instruction
        )
        if avoid_questions:
            listed = "\n".join(f"- {q}" for q in avoid_questions)
            prompt += (
                "\n\nDO NOT REPEAT (these questions already exist in a previous version of this exam):\n"
                f"{listed}\n\n"
                "The above were already asked. Do not reuse them, reword them, or lightly rephrase them — "
                "that would not be genuine practice material. Generate entirely NEW questions covering "
                "DIFFERENT specific facts, concepts, examples, or angles from the source material than "
                "the ones listed above."
            )
        return prompt

    # --- AI Grading (subjective short/long answers) ---

    GRADING_SYSTEM_PROMPT = (
        "You are a Senior Academic Examiner grading student responses to short and long answer questions.\n\n"
        "YOUR JOB: Break the model answer (and marking scheme, if provided) down into 3-6 distinct rubric criteria, "
        "check the student's response against each one, then award a score out of the maximum marks and explain your reasoning.\n\n"
        "ABSOLUTE RULES:\n"
        "1. ✓ Score strictly according to the STRICTNESS LEVEL instructions given below — do not apply your own default leniency.\n"
        "2. ✓ Judge the student's response on its own merits. Do not penalize different wording or structure if the underlying concept is correct.\n"
        "3. ✓ ALWAYS explain what the student got right (feedback) and what they missed (missing), even for a perfect or zero score.\n"
        "4. ✓ ALWAYS break your reasoning into concrete rubric_criteria items — each one a specific point from the model answer/marking "
        "scheme, marked matched true/false with a one-sentence note. These criteria are what the score is actually based on.\n"
        "5. ✗ NEVER invent facts about the student's response — only reference what they actually wrote.\n"
        "6. ✓ Respond with a SINGLE valid JSON object only, in the exact schema requested. No prose outside the JSON.\n"
    )

    GRADING_STRICTNESS_RUBRIC = {
        "easy": (
            "STRICTNESS: EASY (lenient). Award generous partial credit for any correct concept mentioned, "
            "even if incomplete or loosely worded. Give the benefit of the doubt on ambiguous phrasing. "
            "Only score near-zero if the response is blank, off-topic, or entirely wrong."
        ),
        "medium": (
            "STRICTNESS: MEDIUM (balanced). Award credit proportional to how much of the model answer's key "
            "concepts are correctly covered. Minor omissions cost some marks; the core concept must be present "
            "and correctly explained for full marks."
        ),
        "hard": (
            "STRICTNESS: HARD (strict). Require exact concept matching against the model answer and marking scheme. "
            "Partial or vague coverage of a concept earns partial credit only for that specific concept. "
            "Full marks require complete, precise, and correctly justified coverage of every point in the marking scheme."
        ),
    }

    GRADING_PROMPT_TEMPLATE = """
    Question: {question}

    Model Answer: {model_answer}
    {marking_scheme_block}
    Maximum Marks: {max_score}

    {strictness_instruction}

    {grammar_instruction}

    Student's Response: {student_response}

    Respond with a SINGLE JSON object in exactly this schema:
    {{
        "content_score": <number, 0 to {max_score} — based on rubric_criteria below ONLY, never factor grammar into this number>,
        "max_score": {max_score},
        "rubric_criteria": [
            {{"criterion": "<one specific point from the model answer/marking scheme, short label>", "matched": <true/false>, "note": "<one sentence on why, referencing the student's actual response>"}}
            // 3 to 6 items covering the distinct points a grader would actually check for
        ],
        "feedback": "<summary of what the student got right, 1-3 sentences>",
        "missing": "<summary of what was missing or incorrect, 1-3 sentences; empty string if nothing was missing>"{grammar_field}
    }}
    """

    @classmethod
    def build_grading_prompt(cls, question: str, model_answer: str, student_response: str,
                              max_score: int, strictness: str = "medium",
                              grammar_check: bool = False, marking_scheme: str = None) -> str:
        strictness_key = (strictness or "medium").lower()
        strictness_instruction = cls.GRADING_STRICTNESS_RUBRIC.get(strictness_key, cls.GRADING_STRICTNESS_RUBRIC["medium"])

        marking_scheme_block = f"Marking Scheme: {marking_scheme}\n\n" if marking_scheme else "\n"

        if grammar_check:
            grammar_instruction = (
                "GRAMMAR: Separately assess the response's grammar and spelling. Report any deduction as its own "
                "number, NOT folded into content_score — content_score must reflect concept/rubric matching only."
            )
            grammar_field = (
                ',\n        "grammar_deduction": <number, 0 to content_score — points to deduct for grammar/spelling issues, 0 if none>'
                ',\n        "grammar_notes": "<grammar/spelling issues found, or \\"No issues found\\" if none>"'
            )
        else:
            grammar_instruction = "GRAMMAR: Ignore grammar and spelling entirely. Grade on content and concept accuracy only."
            grammar_field = ""

        return cls.GRADING_PROMPT_TEMPLATE.format(
            question=question,
            model_answer=model_answer or "No model answer provided — grade on general correctness and depth.",
            marking_scheme_block=marking_scheme_block,
            max_score=max_score,
            strictness_instruction=strictness_instruction,
            grammar_instruction=grammar_instruction,
            student_response=student_response or "(No response provided)",
            grammar_field=grammar_field,
        )

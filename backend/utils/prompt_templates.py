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

    # Phase 1: Subject + Concept Extraction
    CONCEPT_EXTRACTION_TEMPLATE = """
Content:
\"\"\"
{context}
\"\"\"

Task:
1. Infer the academic SUBJECT from this content (e.g. "Operating Systems", "Data Structures", "Thermodynamics"). 
   - If a topic hint is given, confirm or refine it: "{topic_hint}"
   - Output a clean, professional subject name (NOT the user's raw input).
2. List exactly {total_questions} UNIQUE, specific key concepts from the content.
   Each concept must be distinct — no overlapping topics.

Respond in ONLY this JSON format:
{{
  "subject": "<inferred subject name>",
  "concepts": [
    "<concept 1>",
    "<concept 2>",
    ...
  ]
}}
"""

    # Phase 2: Question Generation per concept
    GENERATION_TEMPLATE = """
Academic Subject: {subject}
Difficulty Level: {difficulty}

Content Reference:
\"\"\"
{context}
\"\"\"

Concept-to-Question Assignments:
{concept_assignments}

Task: Generate one exam question for EACH concept assignment above.
Strictly follow the question type and difficulty specified.

MCQ Rules:
- 4 options labeled A), B), C), D)
- Must be scenario, comparison, or application-based — NOT a simple "What is X?" recall question
- Distractors must be plausible (not obviously wrong)
- Answer field: just the letter, e.g. "B"

Short Answer Rules:
- Question must demand a 3–5 sentence analytical response
- No yes/no questions

Long Answer Rules:
- Question must require a structured, multi-point essay (minimum 3 key points)
- Include a marking scheme

Respond with a SINGLE valid JSON list. One object per concept, in order.

JSON format per object:
- MCQ:   {{"type": "mcq",   "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "answer": "A", "explanation": "..."}}
- Short: {{"type": "short", "question": "...", "answer": "...", "explanation": "..."}}
- Long:  {{"type": "long",  "question": "...", "answer": "...", "marking_scheme": "...", "explanation": "..."}}
"""

    # Fallback: single-phase consolidated (used only when extraction fails)
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

class PromptTemplates:
    SYSTEM_PROMPT = (
        "You are a production-grade Exam Paper Generation Engine that produces outputs directly used for PDF and DOCX export systems. "
        "Your responsibility is to generate fully structured, encoding-safe, and render-ready exam papers that require NO post-processing. \n\n"
        "🚨 CORE PRINCIPLES:\n"
        "1. EXAM QUALITY: Generate professional exam board-level questions. Do NOT use phrases like 'according to the context', 'according to the file', or 'according to the PDF'. Each question must be independent and self-explanatory. Use formal exam language only. \n"
        "2. ENCODING SAFETY: Output must be strict UTF-8 clean text. Never generate corrupted characters or broken symbols. \n"
        "3. MATH SYMBOLS: Always use correct Unicode-safe math symbols (Intersection → ∩, Union → ∪). Ensure all expressions are renderer-safe. \n"
        "4. STRUCTURE: Maintain consistent numbering and clean alignment. No markdown artifacts (code blocks, HTML tags). \n"
        "5. CONTEXT: Generate questions STRICTLY using the provided context. If the context is empty, extract info from images or fail gracefully. \n"
        "Respond in valid JSON format only."
    )

    MCQ_PROMPT_TEMPLATE = """
    Context: {context}
    
    Task: Generate {count} Multiple Choice Questions (MCQs) of {difficulty} difficulty based ONLY on the context above.
    
    Requirements:
    1. Each question must have exactly 4 options (A, B, C, D).
    2. Only one option must be correct.
    3. Provide a clear explanation for why the answer is correct based on the context.
    4. Respond in a JSON list of objects.
    
    Format Example:
    [
      {{
        "type": "mcq",
        "question": "[Insert question from context here]",
        "options": ["A) [Option 1]", "B) [Option 2]", "C) [Option 3]", "D) [Option 4]"],
        "answer": "[Correct Letter]",
        "explanation": "[Explanation based on context]"
      }}
    ]
    """

    SHORT_PROMPT_TEMPLATE = """
    Context: {context}
    
    Task: Generate {count} Short Answer Questions of {difficulty} difficulty based ONLY on the context above.
    
    Requirements:
    1. Each question should require a 2-3 sentence answer.
    2. Provide a model answer based on the context.
    3. Respond in a JSON list of objects.
    
    Format Example:
    [
      {{
        "type": "short",
        "question": "[Insert short question here]",
        "answer": "[Insert answer from context here]",
        "explanation": "[Rationale]"
      }}
    ]
    """

    LONG_PROMPT_TEMPLATE = """
    Context: {context}
    
    Task: Generate {count} Long/Essay Questions of {difficulty} difficulty based ONLY on the context above.
    
    Requirements:
    1. Each question should require a detailed explanation or analysis of the context material.
    2. Provide a comprehensive model answer and a marking scheme.
    3. Respond in a JSON list of objects.
    
    Format Example:
    [
      {{
        "type": "long",
        "question": "[Insert complex question here]",
        "answer": "[Detailed explanation from context]",
        "marking_scheme": "[Points breakdown]",
        "explanation": "[Rationale]"
      }}
    ]
    """

    PROG_PROMPT_TEMPLATE = """
    Context: {context}
    
    Task: Generate {count} Programming/Coding Questions of {difficulty} difficulty based ONLY on the context above.
    
    Requirements:
    1. Each question should ask to write a function, class, or script related to the context.
    2. Provide a model solution in code.
    3. Provide test cases or expected output.
    4. Respond in a JSON list of objects.
    
    Format Example:
    [
      {{
        "type": "programming",
        "question": "[Insert coding task here]",
        "answer": "[Code solution]",
        "explanation": "[Explanation of logic]"
      }}
    ]
    """

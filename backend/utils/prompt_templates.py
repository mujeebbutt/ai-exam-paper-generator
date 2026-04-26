class PromptTemplates:
    SYSTEM_PROMPT = (
        "You are an expert academic examiner. Your task is to generate high-quality exam questions "
        "STRICTLY using the provided context. \n"
        "CRITICAL RULE: If the context is empty or unrelated to a specific subject, DO NOT generate generic questions. "
        "ONLY use the information in the 'Context' section below. "
        "DO NOT use your general knowledge to invent topics like Biology or History unless they are in the context. "
        "You must respond in valid JSON format only."
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

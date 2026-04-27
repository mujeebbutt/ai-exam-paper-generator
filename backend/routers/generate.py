from fastapi import APIRouter, HTTPException, Depends
from models.schemas import GenerateRequest
from services.vector_store import VectorStore
from services.llm_service import LLMService
from services.ocr_service import OCRService
from services.validator import Validator
from services.deduplicator import Deduplicator
from services.bloom_classifier import BloomClassifier
from utils.prompt_templates import PromptTemplates
from db.database import get_db
from db import models
from sqlalchemy.orm import Session
from typing import List
import json
import logging
import asyncio
from datetime import datetime

router = APIRouter()
vector_store = VectorStore()
llm_service = LLMService()

@router.post("/generate")
async def generate_exam(request: GenerateRequest, db: Session = Depends(get_db)):
    """
    Main Multi-modal RAG generation endpoint.
    Supports both text-based and scanned PDFs via Gemini Vision.
    """
    # 1. Get extracted text AND images (for Vision fallback)
    full_text, images = OCRService.process_session_files(request.session_id)
    
    # If we have neither text nor images, it's really empty
    if not full_text and not images:
        raise HTTPException(status_code=400, detail="The file is empty or cannot be read.")

    # 2. Store whatever text we have in Vector Store
    if full_text:
        vector_store.store_document(request.session_id, full_text)

    all_generated_questions = []

    # Helper to generate questions by type
    async def process_generation(q_type, count, template):
        if count <= 0: return []
        
        logging.info(f"Generating {count} {q_type} questions for session {request.session_id}")
        
        # Retrieval
        context_text = ""
        if full_text:
            query = f"Provide information to generate {q_type} questions regarding {request.topic or 'the content'}"
            context_chunks = vector_store.query(request.session_id, query, n_results=5)
            context_text = "\n".join(context_chunks)

        # If context is empty but we have images, we tell Gemini to look at the images
        vision_instruction = ""
        if not context_text and images:
            vision_instruction = "The provided context is empty, so please extract information directly from the attached images of the document pages."

        prompt = template.format(
            context=context_text or "See attached images",
            count=count,
            difficulty=request.difficulty
        )
        
        full_prompt = f"{vision_instruction}\n{prompt}"

        try:
            # We send images along with the prompt
            response_json = await llm_service.generate_response(
                full_prompt, 
                PromptTemplates.SYSTEM_PROMPT, 
                images=images if not context_text else None # Send images only if native text failed or as secondary
            )
            questions = llm_service.parse_json_response(response_json)
            
            valid_questions = []
            if questions and isinstance(questions, list):
                for q in questions:
                    if Validator.validate_question(q):
                        q["difficulty"] = request.difficulty
                        q["bloom_level"] = BloomClassifier.classify(q["question"], request.difficulty)
                        valid_questions.append(q)
            
            return valid_questions
        except Exception as e:
            logging.error(f"Error generating {q_type} questions: {e}")
            return []

    # Generate each type
    mcqs = await process_generation("MCQ", request.mcq_count, PromptTemplates.MCQ_PROMPT_TEMPLATE)
    all_generated_questions.extend(mcqs)
    
    await asyncio.sleep(0.5)
    shorts = await process_generation("Short", request.short_count, PromptTemplates.SHORT_PROMPT_TEMPLATE)
    all_generated_questions.extend(shorts)
    
    await asyncio.sleep(0.5)
    longs = await process_generation("Long", request.long_count, PromptTemplates.LONG_PROMPT_TEMPLATE)
    all_generated_questions.extend(longs)

    await asyncio.sleep(0.5)
    progs = await process_generation("Programming", request.prog_count, PromptTemplates.PROG_PROMPT_TEMPLATE)
    all_generated_questions.extend(progs)

    if not all_generated_questions:
        raise HTTPException(status_code=500, detail="Failed to generate any questions. Gemini couldn't find enough content.")

    # SAVE TO LIBRARY
    try:
        total_marks = (
            (len(mcqs) * request.mcq_marks) +
            (len(shorts) * request.short_marks) +
            (len(longs) * request.long_marks) +
            (len(progs) * request.prog_marks)
        )
        
        new_exam = models.Exam(
            session_id=request.session_id,
            title=request.exam_title,
            subject=request.topic or "General",
            date=datetime.now().strftime("%Y-%m-%d %H:%M"),
            total_marks=total_marks,
            time_limit=request.time_limit,
            passing_percentage=request.passing_percentage,
            mcq_marks=request.mcq_marks,
            short_marks=request.short_marks,
            long_marks=request.long_marks,
            prog_marks=request.prog_marks,
            branding=request.branding.dict() if request.branding else None,
            student_info=request.student_info.dict() if request.student_info else None,
            questions_data=all_generated_questions 
        )
        db.add(new_exam)
        db.commit()
    except Exception as e:
        logging.error(f"Database Save Error: {e}")

    return {
        "session_id": request.session_id,
        "question_count": len(all_generated_questions),
        "questions": all_generated_questions
    }

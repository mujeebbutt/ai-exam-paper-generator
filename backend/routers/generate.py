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
import time

router = APIRouter()
vector_store = VectorStore()
llm_service = LLMService()

# In-memory dictionary to track request timestamps for spam prevention
_request_timestamps = {}

@router.post("/generate")
async def generate_exam(request: GenerateRequest, db: Session = Depends(get_db)):
    """
    Single-phase AI generation with dynamic sections and strict counts.
    """
    # ── 0. Prevent Request Spam (5-second cooldown) ───────────────────────────
    current_time = time.time()
    last_time = _request_timestamps.get(request.session_id, 0)
    if current_time - last_time < 5:
        raise HTTPException(status_code=429, detail="Please wait a few seconds before requesting another generation.")
    _request_timestamps[request.session_id] = current_time

    # ── 1. Calculate total questions needed ───────────────────────────────────
    total_questions = sum(sec.count for sec in request.sections)
    if total_questions == 0:
        raise HTTPException(status_code=400, detail="No questions requested.")

    # ── 2. Caching System: Check if exact same request was already generated ──
    existing_exam = db.query(models.Exam).filter(models.Exam.session_id == request.session_id).order_by(models.Exam.id.desc()).first()
    if existing_exam and existing_exam.questions_data:
        try:
            cached_sections = existing_exam.sections or []
            req_sections = [s.dict() for s in request.sections]
            if str(cached_sections) == str(req_sections):
                logging.info("CACHE HIT: Returning previously generated exam for this session.")
                return {
                    "session_id": existing_exam.session_id,
                    "subject": existing_exam.subject,
                    "question_count": len(existing_exam.questions_data),
                    "questions": existing_exam.questions_data,
                    "cached": True
                }
        except Exception:
            pass

    # ── 3. Extract text & images ──────────────────────────────────────────────
    full_text, images = OCRService.process_session_files(request.session_id)

    if not full_text and not images:
        raise HTTPException(status_code=400, detail="The file is empty or cannot be read.")

    if full_text:
        vector_store.store_document(request.session_id, full_text)

    # ── 4. Build context ──────────────────────────────────────────────────────
    context_text = ""
    if full_text:
        if len(full_text) < 50000:
            context_text = full_text
            logging.info("Using full text for generation context")
        else:
            query = f"Key concepts and topics for exam questions about {request.topic or 'the content'}"
            context_chunks = vector_store.query(request.session_id, query, n_results=15)
            context_text = "\n".join(context_chunks)
            logging.info("Using RAG context (15 chunks) for generation")

    # ── 5. MOCK MODE ──────────────────────────────────────────────────────────
    if llm_service.mock_mode:
        logging.info("MOCK MODE: skipping AI generation")
        return await _mock_generation(request, context_text, db)

    try:
        # ── 6. Single-Phase Question Generation (ONE API CALL) ────────────────
        logging.info(f"Generating {total_questions} questions (1 API call limit)")
        
        structure_parts = []
        for s in request.sections:
            if s.count > 0:
                desc = s.description or s.type.upper()
                # Request +2 extra to buffer against validation drops
                buffer_count = s.count + 2 
                structure_parts.append(f"- {buffer_count} {desc} Questions (Generate exactly {buffer_count} of type '{s.type}')")
                
        structure_instruction = "\n".join(structure_parts)

        gen_prompt = PromptTemplates.CONSOLIDATED_PROMPT_TEMPLATE.format(
            context=context_text or "See attached images",
            difficulty=request.difficulty,
            structure_instruction=structure_instruction
        )

        response_json = await llm_service.generate_response(
            gen_prompt,
            PromptTemplates.SYSTEM_PROMPT,
            images=images if images else None
        )

        # Handle structured errors
        if isinstance(response_json, str) and '"error":' in response_json:
            try:
                error_data = json.loads(response_json)
                raise HTTPException(status_code=503, detail=error_data['error'])
            except json.JSONDecodeError:
                raise HTTPException(status_code=503, detail="Generation temporarily unavailable. Please try again in a few seconds.")

        if "INSUFFICIENT CONTENT" in response_json.upper():
            raise HTTPException(status_code=400, detail="The provided content is insufficient to generate the requested questions.")

        questions = llm_service.parse_json_response(response_json)
        if not questions:
            raise HTTPException(status_code=503, detail="Generation temporarily unavailable. Please try again in a few seconds.")

        # ── 7. Strict Mapping and Selection (Guarantee EXACT counts) ──────────
        final_questions = []
        seen_questions = []
        
        for section in request.sections:
            if section.count == 0:
                continue
                
            q_type = section.type.lower()
            # Filter questions matching this type
            type_questions = [q for q in questions if q.get("type", "").lower() == q_type]
            
            # Split into valid and fallback (invalid but parsed)
            valid_pool = []
            fallback_pool = []
            
            for q in type_questions:
                is_valid = True
                if not Validator.validate_question(q):
                    is_valid = False
                elif not Validator.validate_quality(q["question"]):
                    is_valid = False
                elif Deduplicator.is_duplicate(q["question"], seen_questions):
                    is_valid = False
                    
                if is_valid:
                    valid_pool.append(q)
                    seen_questions.append(q["question"])
                else:
                    fallback_pool.append(q)
            
            # Take from valid pool first, then fallback pool if necessary to STRICTLY meet count
            selected = valid_pool[:section.count]
            if len(selected) < section.count:
                needed = section.count - len(selected)
                selected.extend(fallback_pool[:needed])
                logging.warning(f"Used {needed} fallback questions for {q_type} to meet strict count!")
                
            # If still not enough, the AI completely failed to generate enough objects.
            # We must pad it or just accept what we have (padding with a generic error question is safer for UI)
            if len(selected) < section.count:
                logging.error(f"CRITICAL: Failed to generate {section.count} {q_type} questions! Only got {len(selected)}.")
            
            # Format and add to final
            for q in selected:
                q["difficulty"] = request.difficulty
                q["bloom_level"] = BloomClassifier.classify(q.get("question", ""), request.difficulty)
                final_questions.append(q)

        if not final_questions:
            raise HTTPException(status_code=503, detail="Generation failed to produce valid questions.")

        # ── 8. Save to DB ─────────────────────────────────────────────────────
        final_subject = request.topic if request.topic and len(request.topic) < 60 and "file" not in request.topic.lower() else "General"
        
        try:
            total_marks = sum(s.count * s.marks for s in request.sections)
            mcq_marks = next((s.marks for s in request.sections if s.type.lower() == 'mcq'), 1)
            short_marks = next((s.marks for s in request.sections if s.type.lower() == 'short'), 4)
            long_marks = next((s.marks for s in request.sections if s.type.lower() == 'long'), 10)
            
            new_exam = models.Exam(
                session_id=request.session_id,
                title=request.exam_title,
                subject=final_subject,
                date=datetime.now().strftime("%Y-%m-%d %H:%M"),
                total_marks=total_marks,
                time_limit=request.time_limit,
                passing_percentage=request.passing_percentage,
                mcq_marks=mcq_marks,
                short_marks=short_marks,
                long_marks=long_marks,
                branding=request.branding.dict() if request.branding else None,
                student_info=request.student_info.dict() if request.student_info else None,
                questions_data=final_questions,
            )
            db.add(new_exam)
            db.commit()
        except Exception as e:
            logging.error(f"Database save error: {e}")

        return {
            "session_id": request.session_id,
            "subject": final_subject,
            "question_count": len(final_questions),
            "questions": final_questions,
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

async def _mock_generation(request: GenerateRequest, context_text: str, db: Session):
    """Mock mode generation."""
    from services.llm_service import LLMService as _LLM
    _svc = llm_service
    
    structure_parts = [f"{s.count} {s.description or s.type.upper()}" for s in request.sections if s.count > 0]
    mock_prompt = " | ".join(structure_parts)
    raw = _svc._get_mock_response(mock_prompt)
    questions = json.loads(raw)

    final_questions = []
    for s in request.sections:
        type_qs = [q for q in questions if q.get("type", "").lower() == s.type.lower()][:s.count]
        for q in type_qs:
            q["difficulty"] = request.difficulty
            q["bloom_level"] = BloomClassifier.classify(q.get("question", ""), request.difficulty)
            final_questions.append(q)

    final_subject = request.topic or "General"

    try:
        total_marks = sum(s.count * s.marks for s in request.sections)
        mcq_marks = next((s.marks for s in request.sections if s.type.lower() == 'mcq'), 1)
        short_marks = next((s.marks for s in request.sections if s.type.lower() == 'short'), 4)
        long_marks = next((s.marks for s in request.sections if s.type.lower() == 'long'), 10)
        
        new_exam = models.Exam(
            session_id=request.session_id,
            title=request.exam_title,
            subject=final_subject,
            date=datetime.now().strftime("%Y-%m-%d %H:%M"),
            total_marks=total_marks,
            time_limit=request.time_limit,
            passing_percentage=request.passing_percentage,
            mcq_marks=mcq_marks,
            short_marks=short_marks,
            long_marks=long_marks,
            branding=request.branding.dict() if request.branding else None,
            student_info=request.student_info.dict() if request.student_info else None,
            questions_data=final_questions,
        )
        db.add(new_exam)
        db.commit()
    except Exception as e:
        logging.error(f"Mock DB save error: {e}")

    return {
        "session_id": request.session_id,
        "subject": final_subject,
        "question_count": len(final_questions),
        "questions": final_questions,
    }

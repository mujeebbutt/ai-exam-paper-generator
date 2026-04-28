from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db import models
from models import schemas
from typing import List

router = APIRouter()

@router.get("/questions", response_model=List[schemas.Question])
def get_questions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    questions = db.query(models.Question).offset(skip).limit(limit).all()
    return questions

@router.post("/questions", response_model=schemas.Question)
def create_question(question: schemas.QuestionCreate, db: Session = Depends(get_db)):
    db_question = models.Question(**question.dict())
    db.add(db_question)
    db.commit()
    db.refresh(db_question)
    return db_question

@router.get("/exams", response_model=List[schemas.Exam])
def get_exams(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    exams = db.query(models.Exam).offset(skip).limit(limit).all()
    return exams

@router.delete("/exams/{session_id}")
def delete_exam(session_id: str, db: Session = Depends(get_db)):
    print(f"Attempting to delete exam with session_id: {session_id}")
    
    # Normalize ID: remove any whitespace, quotes, or accidental prefixing
    target_id = str(session_id).strip().strip('"').strip("'").strip('#')
    print(f"DEBUG: Attempting to delete exam with normalized ID: {target_id}")
    
    # 1. Try finding by session_id (String)
    exam = db.query(models.Exam).filter(models.Exam.session_id == target_id).first()
    
    # 2. Try finding by id (Integer)
    if not exam:
        try:
            numeric_id = int(target_id)
            exam = db.query(models.Exam).filter(models.Exam.id == numeric_id).first()
        except (ValueError, TypeError):
            pass

    # 3. Last resort: Partial match on session_id
    if not exam:
        exam = db.query(models.Exam).filter(models.Exam.session_id.contains(target_id)).first()

    if not exam:
        # Debug: Log all existing IDs to see why we can't find it
        all_exams = db.query(models.Exam).all()
        print(f"DEBUG: IDs in DB: {[e.id for e in all_exams]}")
        print(f"DEBUG: Sessions in DB: {[e.session_id for e in all_exams]}")
        raise HTTPException(status_code=404, detail=f"Exam not found. Attempted ID: {target_id}")
    
    db.delete(exam)
    db.commit()
    print(f"Exam {session_id} deleted successfully.")
    return {"message": "Exam deleted"}

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

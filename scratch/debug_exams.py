
import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from db.database import SessionLocal
from db import models
from models import schemas
from pydantic import ValidationError

db = SessionLocal()
try:
    exams = db.query(models.Exam).all()
    print(f"Found {len(exams)} exams in DB.")
    for i, exam in enumerate(exams):
        try:
            # Try to validate against the schema
            s_exam = schemas.Exam.from_orm(exam)
            print(f"Exam {i} validated OK.")
        except ValidationError as e:
            print(f"Exam {i} FAILED validation:")
            print(e)
            print("Object data:", {c.name: getattr(exam, c.name) for c in exam.__table__.columns})
except Exception as e:
    print(f"Query FAILED: {e}")
finally:
    db.close()

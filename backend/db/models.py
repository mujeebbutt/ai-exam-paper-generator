from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from db.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="teacher") # admin, teacher, student

    questions = relationship("Question", back_populates="owner")
    exams = relationship("Exam", back_populates="owner")

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(String, index=True)
    text = Column(Text, nullable=False)
    type = Column(String) # MCQ, Short, Long
    options = Column(JSON, nullable=True) # JSON list for MCQs
    answer = Column(Text)
    explanation = Column(Text)
    difficulty = Column(String) # Easy, Medium, Hard
    bloom_level = Column(String) # Remember, Understand, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="questions")

class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    session_id = Column(String, index=True)
    title = Column(String)
    subject = Column(String)
    date = Column(String)
    total_marks = Column(Integer)
    time_limit = Column(String)
    passing_percentage = Column(Integer)
    mcq_marks = Column(Integer)
    short_marks = Column(Integer)
    long_marks = Column(Integer)
    prog_marks = Column(Integer)
    branding = Column(JSON) # Store uni, dept, logo_path
    student_info = Column(JSON) # Store enabled, show_name, show_roll_no
    questions_data = Column(JSON) # List of question IDs or snapshot
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="exams")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="active") # active, completed, expired
    created_at = Column(DateTime, default=datetime.utcnow)

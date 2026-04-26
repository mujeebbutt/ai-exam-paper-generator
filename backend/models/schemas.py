from pydantic import BaseModel, EmailStr
from typing import List, Optional, Any
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    role: str
    class Config:
        from_attributes = True

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Question Schemas
class QuestionBase(BaseModel):
    text: str
    type: str # MCQ, Short, Long
    options: Optional[List[str]] = None
    answer: str
    explanation: Optional[str] = None
    difficulty: str
    bloom_level: Optional[str] = None

class QuestionCreate(QuestionBase):
    session_id: str

class Question(QuestionBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True

# Exam Schemas
class ExamBase(BaseModel):
    title: str
    subject: str
    date: str
    total_marks: int
    session_id: Optional[str] = None
    questions_data: Any # Can be list of dicts or list of IDs

class ExamCreate(ExamBase):
    pass

class Exam(ExamBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True

# Generation Request
class GenerateRequest(BaseModel):
    session_id: str
    mcq_count: int = 10
    short_count: int = 5
    long_count: int = 2
    difficulty: str = "medium"
    topic: Optional[str] = None

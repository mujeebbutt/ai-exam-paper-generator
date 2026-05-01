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

# Branding Schemas
class BrandingInfo(BaseModel):
    uni: Optional[str] = ""
    dept: Optional[str] = ""
    logo_path: Optional[str] = None
    enable_watermark: bool = False
    watermark_text: Optional[str] = "CONFIDENTIAL"

class StudentInfo(BaseModel):
    enabled: bool = True
    show_name: bool = True
    show_roll_no: bool = True
    show_class: bool = True
    show_date: bool = True
    show_section: bool = True
    show_bloom_tags: bool = True
    multi_column_mcqs: bool = False

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
class SectionConfig(BaseModel):
    type: str
    count: int
    marks: int
    description: Optional[str] = None

# Exam Schemas
class ExamBase(BaseModel):
    title: str
    subject: str
    date: str
    total_marks: int
    session_id: Optional[str] = None
    questions_data: Any # Can be list of dicts or list of IDs
    exam_title: Optional[str] = "Professional Assessment"
    time_limit: Optional[str] = "2 Hours"
    passing_percentage: Optional[int] = 40
    mcq_marks: Optional[int] = 1
    short_marks: Optional[int] = 4
    long_marks: Optional[int] = 10
    branding: Optional[BrandingInfo] = None
    student_info: Optional[StudentInfo] = None

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
    sections: List[SectionConfig]
    difficulty: str = "medium"
    topic: Optional[str] = None
    time_limit: str = "2 Hours"
    passing_percentage: int = 40
    exam_title: str = "Final Examination"
    branding: Optional[BrandingInfo] = None
    student_info: Optional[StudentInfo] = None

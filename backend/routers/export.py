from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from services.export_service import ExportService
from pydantic import BaseModel
from typing import List, Optional
import os

router = APIRouter()
# Removed global export_service instantiation to avoid stale objects

from models.schemas import BrandingInfo, StudentInfo

class ExportRequest(BaseModel):
    session_id: str
    format: str # 'pdf' or 'docx'
    questions: List[dict]
    branding: Optional[BrandingInfo] = None
    student_info: Optional[StudentInfo] = None
    is_answer_key: Optional[bool] = False
    include_answers: Optional[bool] = True
    subject: Optional[str] = "Exam"
    topic: Optional[str] = "Assessment"
    exam_title: Optional[str] = "Final Examination"
    time_limit: Optional[str] = "2 Hours"
    total_marks: Optional[int] = 100
    passing_marks: Optional[int] = 40
    passing_percentage: Optional[int] = 40
    mcq_marks: Optional[int] = 1
    short_marks: Optional[int] = 4
    long_marks: Optional[int] = 10
    prog_marks: Optional[int] = 15

@router.post("/export")
async def export_exam(request: ExportRequest):
    # Instantiate service inside route to ensure fresh class definition
    export_service = ExportService()
    """
    Generates and returns the exam file.
    """
    try:
        if request.format.lower() == 'pdf':
            file_path = await export_service.generate_pdf_file(
                request.session_id, 
                request.questions, 
                request.branding, 
                is_answer_key=request.is_answer_key,
                include_answers=request.include_answers,
                subject=request.subject,
                topic=request.topic,
                exam_title=request.exam_title,
                time_limit=request.time_limit,
                total_marks=request.total_marks,
                passing_marks=request.passing_marks,
                passing_percentage=request.passing_percentage,
                mcq_marks=request.mcq_marks,
                short_marks=request.short_marks,
                long_marks=request.long_marks,
                prog_marks=request.prog_marks,
                student_info=request.student_info
            )
            media_type = "application/pdf"
        elif request.format.lower() == 'docx':
            file_path = export_service.generate_docx_file(
                request.session_id, 
                request.questions, 
                request.branding, 
                is_answer_key=request.is_answer_key,
                include_answers=request.include_answers,
                subject=request.subject,
                topic=request.topic,
                exam_title=request.exam_title,
                time_limit=request.time_limit,
                total_marks=request.total_marks,
                passing_marks=request.passing_marks,
                passing_percentage=request.passing_percentage,
                mcq_marks=request.mcq_marks,
                short_marks=request.short_marks,
                long_marks=request.long_marks,
                prog_marks=request.prog_marks,
                student_info=request.student_info
            )
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        else:
            raise HTTPException(status_code=400, detail="Invalid format. Support PDF and DOCX only.")
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=500, detail="File generation failed.")
            
        return FileResponse(
            path=file_path,
            filename=os.path.basename(file_path),
            media_type=media_type,
            headers={"Access-Control-Expose-Headers": "Content-Disposition"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

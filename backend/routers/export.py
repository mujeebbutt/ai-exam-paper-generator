from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from services.export_service import ExportService
from pydantic import BaseModel
from typing import List
import os

router = APIRouter()
export_service = ExportService()

from typing import List, Optional

class BrandingInfo(BaseModel):
    uni: Optional[str] = ""
    dept: Optional[str] = ""

class ExportRequest(BaseModel):
    session_id: str
    format: str # 'pdf' or 'docx'
    questions: List[dict]
    branding: Optional[BrandingInfo] = None
    is_answer_key: Optional[bool] = False
    include_answers: Optional[bool] = True
    subject: Optional[str] = "Exam"
    topic: Optional[str] = "Assessment"

@router.post("/export")
async def export_exam(request: ExportRequest):
    """
    Generates and returns the exam file.
    """
    try:
        if request.format.lower() == 'pdf':
            file_path = await export_service.generate_pdf(
                request.session_id, 
                request.questions, 
                request.branding, 
                is_answer_key=request.is_answer_key,
                include_answers=request.include_answers,
                subject=request.subject,
                topic=request.topic
            )
            media_type = "application/pdf"
        elif request.format.lower() == 'docx':
            file_path = export_service.generate_docx(
                request.session_id, 
                request.questions, 
                request.branding, 
                is_answer_key=request.is_answer_key,
                include_answers=request.include_answers,
                subject=request.subject,
                topic=request.topic
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
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
import uuid
import os
import shutil

router = APIRouter()

UPLOAD_DIR = r"C:\ai_exam_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """
    Upload PDF or Image files. Generates a session ID and saves files.
    """
    session_id = str(uuid.uuid4())
    session_path = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_path, exist_ok=True)
    
    saved_files = []
    
    for file in files:
        if not file.filename.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg')):
            continue
            
        file_path = os.path.join(session_path, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        saved_files.append({
            "filename": file.filename,
            "path": file_path,
            "type": file.content_type
        })
        
    if not saved_files:
        raise HTTPException(status_code=400, detail="No valid files uploaded. Support PDF and Images only.")
        
    return {
        "session_id": session_id,
        "files_uploaded": len(saved_files),
        "status": "success"
    }

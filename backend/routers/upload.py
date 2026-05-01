from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import shutil
import uuid
from typing import List

router = APIRouter()

# Portable upload directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """
    Handle multiple file uploads and create a session.
    Returns a session_id that identifies the set of files.
    """
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)

    saved_files = []
    for file in files:
        if not file.filename:
            continue
            
        # Security check: only allow certain extensions
        if not file.filename.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg')):
            continue
            
        file_path = os.path.join(session_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file.filename)

    if not saved_files:
        # Clean up empty directory
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=400, detail="No valid files uploaded. Support PDF and Images only.")

    return {
        "session_id": session_id,
        "files": saved_files,
        "message": f"Successfully uploaded {len(saved_files)} files"
    }

@router.post("/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    """
    Upload a logo for branding.
    """
    logo_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    logo_filename = f"logo_{logo_id}{ext}"
    
    # We'll put logos in a 'static/logos' folder
    logo_dir = os.path.join(BASE_DIR, "static", "logos")
    os.makedirs(logo_dir, exist_ok=True)
    
    file_path = os.path.join(logo_dir, logo_filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {
        "logo_url": f"http://127.0.0.1:8000/static/logos/{logo_filename}"
    }

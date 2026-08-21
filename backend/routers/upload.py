from fastapi import APIRouter, UploadFile, File, HTTPException, Request
import os
import shutil
import uuid
from typing import List, Optional

router = APIRouter()

# Portable upload directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_files(
    files: Optional[List[UploadFile]] = File(None),
    file: Optional[UploadFile] = File(None)
):
    """
    Handle file uploads - accepts either a single 'file' or multiple 'files'
    Returns a session_id that identifies the set of files.
    """
    # Check if we have any files
    if not files and not file:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    # If single file was sent
    if file and not files:
        files_to_process = [file]
    # If multiple files were sent as 'files' parameter
    elif files and not file:
        files_to_process = files
    else:
        # Both were sent - combine them
        files_to_process = list(files) + [file] if files else [file]
    
    # Create session
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    saved_files = []
    for upload_file in files_to_process:
        if not upload_file.filename:
            continue
            
        # Security check: only allow certain extensions
        if not upload_file.filename.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg')):
            continue
            
        file_path = os.path.join(session_dir, upload_file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
        saved_files.append(upload_file.filename)
        
        # Close the file
        await upload_file.close()
    
    if not saved_files:
        # Clean up empty directory
        shutil.rmtree(session_dir)
        raise HTTPException(
            status_code=400, 
            detail="No valid files uploaded. Support PDF and Images only."
        )
    
    return {
        "session_id": session_id,
        "files": saved_files,
        "message": f"Successfully uploaded {len(saved_files)} files"
    }

@router.post("/upload-logo")
async def upload_logo(request: Request, file: UploadFile = File(...)):
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

    # Was hardcoded to http://127.0.0.1:8000 — worked only because local dev happens to run the
    # backend there. Derived from the actual incoming request instead, so this resolves correctly
    # in production too (behind Railway's proxy) without hardcoding a domain either way.
    base_url = str(request.base_url).rstrip("/")
    return {
        "logo_url": f"{base_url}/static/logos/{logo_filename}"
    }
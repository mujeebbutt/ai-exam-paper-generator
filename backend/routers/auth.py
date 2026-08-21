from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
from db.database import get_db
from db import models
from models.schemas import (
    RegisterRequest, LoginRequest, TokenResponse, AuthUserOut,
    GoogleAuthRequest, OwnedExamOut, ProfileUpdateRequest,
)
from services.auth_service import AuthService
from typing import Optional, List
from datetime import datetime

router = APIRouter()

# Bump this string whenever the legal pages' content materially changes (matches the "Last
# Updated" date on frontend/terms.html and frontend/privacy.html) — lets a future re-consent
# flow compare a user's terms_version against the current one.
TERMS_VERSION = "2026-08-21"


def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> models.User:
    """
    Required-auth dependency — raises 401 if missing/invalid/expired. This is the actual
    enforcement point; the frontend's route guards (auth.js) only handle the UX of redirecting
    to Login, they don't protect anything by themselves.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")
    token = authorization.split(" ", 1)[1]
    user_id = AuthService.decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


def get_current_user_optional(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> Optional[models.User]:
    """Non-raising variant — used where being logged in is nice-to-have (e.g. attaching an
    owner to a newly generated exam) but anonymous use of the endpoint should still work."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    user_id = AuthService.decode_access_token(token)
    if not user_id:
        return None
    return db.query(models.User).filter(models.User.id == user_id).first()


@router.post("/auth/register", response_model=TokenResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    role = (request.role or "").lower()
    if role not in ("teacher", "student"):
        raise HTTPException(status_code=400, detail="role must be 'teacher' or 'student'.")
    if role == "student" and not (request.grade or "").strip():
        raise HTTPException(status_code=400, detail="grade is required for student accounts.")
    if role == "teacher" and not (request.subject or "").strip():
        raise HTTPException(status_code=400, detail="subject is required for teacher accounts.")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if not request.full_name.strip():
        raise HTTPException(status_code=400, detail="Name is required.")
    if not request.terms_accepted:
        raise HTTPException(status_code=400, detail="You must accept the Terms & Conditions and Privacy Policy to register.")

    existing = db.query(models.User).filter(models.User.email == request.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = models.User(
        full_name=request.full_name.strip(),
        email=request.email.lower(),
        hashed_password=AuthService.hash_password(request.password),
        role=role,
        grade=request.grade.strip() if role == "student" else None,
        subject=request.subject.strip() if role == "teacher" else None,
        terms_accepted=True,
        terms_accepted_at=datetime.utcnow(),
        terms_version=TERMS_VERSION,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = AuthService.create_access_token(user.id)
    return TokenResponse(access_token=token, user=user)


@router.post("/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == request.email.lower()).first()
    if not user or not AuthService.verify_password(request.password, user.hashed_password):
        # Deliberately the same message for "no such user" and "wrong password" — don't
        # reveal which one it was.
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    token = AuthService.create_access_token(user.id)
    return TokenResponse(access_token=token, user=user)


@router.post("/auth/google")
def google_auth(request: GoogleAuthRequest):
    """
    Placeholder — real Google Sign-In needs an actual Firebase project's config (only the
    project owner can create this; see services/auth_service.py's module docstring-equivalent
    comment). Once that config is supplied: verify `request.id_token` against Firebase's public
    keys (or via the Firebase Admin SDK), then get_or_create a User row keyed on google_uid,
    exactly like register()/login() do for email/password.
    """
    raise HTTPException(status_code=501, detail="Google Sign-In is not configured yet.")


@router.get("/auth/me", response_model=AuthUserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.put("/auth/me", response_model=AuthUserOut)
def update_me(request: ProfileUpdateRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Profile page's editable-fields save. Role and email are intentionally not editable here —
    role drives grade/subject validation at registration and email is the login identity."""
    if request.full_name is not None:
        name = request.full_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        current_user.full_name = name
    if request.grade is not None and current_user.role == "student":
        current_user.grade = request.grade.strip() or None
    if request.subject is not None and current_user.role == "teacher":
        current_user.subject = request.subject.strip() or None
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/users/me/exams", response_model=List[OwnedExamOut])
def get_my_exams(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    exams = (
        db.query(models.Exam)
        .filter(models.Exam.user_id == current_user.id)
        .order_by(models.Exam.created_at.desc())
        .all()
    )
    return [
        OwnedExamOut(
            id=e.id, title=e.title, subject=e.subject, date=e.date,
            total_marks=e.total_marks, created_at=e.created_at,
            question_count=len(e.questions_data or []),
        )
        for e in exams
    ]

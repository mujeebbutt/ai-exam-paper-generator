from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import engine, Base
from routers import upload, generate, export, bank
import os
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Exam Generator", version="1.0.0")

# Configure CORS for Vanilla JS frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, specify the exact origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(generate.router, prefix="/api", tags=["Generate"])
app.include_router(export.router, prefix="/api", tags=["Export"])
app.include_router(bank.router, prefix="/api", tags=["Bank"])

@app.get("/")
async def root():
    return {"message": "AI Exam Generator API is running locally via FastAPI"}

if __name__ == "__main__":
    import uvicorn
    # Enable reload so changes take effect immediately
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

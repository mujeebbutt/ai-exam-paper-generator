from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_DIR = os.path.join(BASE_DIR, "data")

# Railway's SQLite file (backend/data/exam_generator.db) lives on the container's ephemeral
# filesystem — every redeploy wipes it. Production sets DATABASE_URL (Railway Postgres, linked
# via env vars); local dev leaves it unset and keeps using the local SQLite file, no Postgres
# install required to run this locally.
DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    # Some providers (Railway included, in places) still hand out the legacy `postgres://`
    # scheme; SQLAlchemy 1.4+ only recognizes `postgresql://` for the same psycopg2 driver.
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = DATABASE_URL
    connect_args = {}
    logging.info("Database: using DATABASE_URL (Postgres)")
else:
    os.makedirs(DB_DIR, exist_ok=True)
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'exam_generator.db')}"
    # SQLite-only: without this, a connection can't be reused across the threads FastAPI's
    # per-request dependency injection hands it to. Not valid/needed for psycopg2.
    connect_args = {"check_same_thread": False}
    logging.info(f"Database: DATABASE_URL not set, falling back to local SQLite at {SQLALCHEMY_DATABASE_URL}")

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

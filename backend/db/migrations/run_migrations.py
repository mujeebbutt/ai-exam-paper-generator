"""
Applies pending .sql migration files in this folder, in filename order, against
the project's SQLite database. Safe to run multiple times: ALTER TABLE ADD COLUMN
statements are skipped individually if the column already exists, and every
CREATE TABLE / CREATE INDEX uses IF NOT EXISTS.

Usage (from anywhere):
    python backend/db/migrations/run_migrations.py
"""
import os
import re
import sqlite3
import glob

# Reuse the same portable path resolution as db/database.py
MIGRATIONS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(os.path.dirname(MIGRATIONS_DIR))
DB_PATH = os.path.join(BACKEND_DIR, "data", "exam_generator.db")

ALTER_ADD_COLUMN_RE = re.compile(
    r"ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)[^;]*;", re.IGNORECASE
)


def column_exists(cur, table, column) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def apply_sql_file(cur, path: str):
    with open(path, "r", encoding="utf-8") as f:
        script = f.read()

    # Handle ALTER TABLE ADD COLUMN statements individually (idempotency check),
    # since SQLite has no "ADD COLUMN IF NOT EXISTS".
    for match in ALTER_ADD_COLUMN_RE.finditer(script):
        statement, table, column = match.group(0), match.group(1), match.group(2)
        if column_exists(cur, table, column):
            print(f"  skip (already applied): {table}.{column}")
        else:
            cur.execute(statement.rstrip(";"))
            print(f"  applied: {table}.{column}")

    # Strip the ALTER statements out, then run the rest (CREATE TABLE/INDEX,
    # all IF NOT EXISTS-guarded) as a script — comments and multi-statement
    # blocks are handled natively by executescript().
    remainder = ALTER_ADD_COLUMN_RE.sub("", script)
    if remainder.strip():
        cur.executescript(remainder)


def run():
    if not os.path.exists(DB_PATH):
        print(f"No database found at {DB_PATH} yet — nothing to migrate (it will be created fresh with the new schema on next app startup).")
        return

    sql_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    if not sql_files:
        print("No .sql migration files found.")
        return

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
        for path in sql_files:
            print(f"Applying {os.path.basename(path)}...")
            apply_sql_file(cur, path)
        con.commit()
        print("Migrations applied successfully.")
    except Exception as e:
        con.rollback()
        print(f"Migration FAILED, rolled back: {e}")
        raise
    finally:
        con.close()


if __name__ == "__main__":
    run()


import sqlite3
import os

db_path = r'i:\AI_Exam_Generator\backend\data\exam_generator.db'
if not os.path.exists(db_path):
    print("Database not found.")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Adding column student_info...")
        cursor.execute("ALTER TABLE exams ADD COLUMN student_info JSON;")
        conn.commit()
        print("Migration successful")
    except sqlite3.OperationalError as e:
        print(f"Skipping: {e}")
            
    conn.close()


import sqlite3
import os

db_path = r'i:\AI_Exam_Generator\backend\data\exam_generator.db'
if not os.path.exists(db_path):
    print("Database not found.")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(exams);")
    columns = cursor.fetchall()
    print("Columns in 'exams' table:")
    for col in columns:
        print(col)
    conn.close()

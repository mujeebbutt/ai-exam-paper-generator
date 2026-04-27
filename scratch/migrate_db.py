
import sqlite3
import os

db_path = r'i:\AI_Exam_Generator\backend\data\exam_generator.db'
if not os.path.exists(db_path):
    print("Database not found.")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    columns_to_add = [
        ("time_limit", "VARCHAR"),
        ("passing_percentage", "INTEGER"),
        ("mcq_marks", "INTEGER"),
        ("short_marks", "INTEGER"),
        ("long_marks", "INTEGER"),
        ("prog_marks", "INTEGER"),
        ("branding", "JSON")
    ]
    
    for col_name, col_type in columns_to_add:
        try:
            print(f"Adding column {col_name}...")
            cursor.execute(f"ALTER TABLE exams ADD COLUMN {col_name} {col_type};")
        except sqlite3.OperationalError as e:
            print(f"Skipping {col_name}: {e}")
            
    conn.commit()
    conn.close()
    print("Migration finished.")

import os
import shutil
from datetime import datetime, timedelta
import logging

class SessionManager:
    UPLOAD_DIR = r"C:\ai_exam_uploads"

    @staticmethod
    def get_session_path(session_id: str) -> str:
        return os.path.join(SessionManager.UPLOAD_DIR, session_id)

    @staticmethod
    def cleanup_old_sessions(hours: int = 24):
        """
        Deletes session folders older than specified hours.
        """
        now = datetime.now()
        if not os.path.exists(SessionManager.UPLOAD_DIR):
            return

        for session_id in os.listdir(SessionManager.UPLOAD_DIR):
            path = os.path.join(SessionManager.UPLOAD_DIR, session_id)
            if os.path.isdir(path):
                # Check creation time
                ctime = datetime.fromtimestamp(os.path.getctime(path))
                if now - ctime > timedelta(hours=hours):
                    try:
                        shutil.rmtree(path)
                        logging.info(f"Deleted expired session: {session_id}")
                    except Exception as e:
                        logging.error(f"Failed to delete session {session_id}: {e}")

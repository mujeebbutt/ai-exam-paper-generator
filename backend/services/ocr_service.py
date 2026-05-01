import fitz  # PyMuPDF
from PIL import Image
import io
import os
import logging
from typing import List, Tuple

class OCRService:
    @staticmethod
    def get_pdf_content(pdf_path: str) -> Tuple[str, List]:
        """
        Extracts both native text AND images of pages if the text is sparse.
        This allows Gemini to use its Vision capabilities for scanned documents.
        """
        try:
            doc = fitz.open(pdf_path)
            full_text = ""
            images = []
            
            for i, page in enumerate(doc):
                # 1. Try native text
                text = page.get_text()
                if text.strip():
                    full_text += text + "\n"
                
                # 2. Always capture the first 5 pages as images if it's a small document
                # or if the text is very short (likely a scan)
                if i < 5: 
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2)) # Higher resolution for better OCR
                    img_data = pix.tobytes("png")
                    images.append(Image.open(io.BytesIO(img_data)))
            
            doc.close()
            return full_text, images
        except Exception as e:
            logging.error(f"Failed to read PDF {pdf_path}: {e}")
            return "", []

    @staticmethod
    def process_session_files(session_id: str) -> Tuple[str, List]:
        """
        Processes all files in a session directory.
        Returns (Combined Text, List of Images).
        """
        # Portable path consistent with upload.py
        BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        session_path = os.path.join(BASE_DIR, "uploads", session_id)
        if not os.path.exists(session_path):
            return "", []
            
        combined_text = ""
        all_images = []
        
        try:
            for filename in os.listdir(session_path):
                file_path = os.path.join(session_path, filename)
                if filename.lower().endswith(".pdf"):
                    text, images = OCRService.get_pdf_content(file_path)
                    combined_text += text
                    all_images.extend(images)
                elif filename.lower().endswith((".png", ".jpg", ".jpeg")):
                    img = Image.open(file_path)
                    all_images.append(img)
                    
            return combined_text, all_images
        except Exception as e:
            logging.error(f"Error processing session files: {e}")
            return "", []

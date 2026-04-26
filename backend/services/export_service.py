import os
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from fpdf import FPDF
import logging
from datetime import datetime

class ExportService:
    def __init__(self):
        # Base exports directory - use project relative path to avoid permission issues
        # This will create an 'exports' folder inside your AI_Exam_Generator directory
        current_dir = os.path.dirname(os.path.abspath(__file__)) # backend/services
        backend_dir = os.path.dirname(current_dir) # backend
        project_root = os.path.dirname(backend_dir) # AI_Exam_Generator
        
        self.output_dir = os.path.join(project_root, "exports")
        try:
            os.makedirs(self.output_dir, exist_ok=True)
        except Exception as e:
            logging.error(f"Failed to create base export directory: {e}")
            # Fallback to a temporary directory if project root is read-only
            import tempfile
            self.output_dir = os.path.join(tempfile.gettempdir(), "ai_exam_exports")
            os.makedirs(self.output_dir, exist_ok=True)

    def _sanitize_filename(self, name: str) -> str:
        import re
        if not name or str(name).lower() == "assessment" or str(name).lower() == "exam":
            return "" # Return empty if it's just a placeholder
        # Replace spaces and special chars with underscores
        name = re.sub(r'[^a-zA-Z0-9]', '_', str(name).strip())
        # Remove multiple underscores
        name = re.sub(r'_+', '_', name).strip('_')
        return name

    def _get_export_path(self, subject: str, format_type: str) -> str:
        """
        Creates and returns path: /exports/Subject/PDF or /exports/Subject/DOCX
        """
        clean_subject = self._sanitize_filename(subject) or "General"
        # Capitalize first letter for folder name
        folder_name = clean_subject.capitalize()
        path = os.path.join(self.output_dir, folder_name, format_type.upper())
        os.makedirs(path, exist_ok=True)
        return path

    def _generate_clean_filename(self, subject: str, topic: str, doc_type: str, ext: str) -> str:
        """
        Generates filename: Subject_Topic_Type.ext
        """
        s = self._sanitize_filename(subject)
        t = self._sanitize_filename(topic)
        
        parts = []
        if s: parts.append(s)
        if t: parts.append(t)
        parts.append(doc_type) # e.g. Exam, Paper, Quiz
        
        return "_".join(parts) + f".{ext}"

    def generate_docx(self, session_id: str, questions: list, branding=None, is_answer_key=False, include_answers=True, subject="Exam", topic="Assessment") -> str:
        doc = Document()
        
        # Branding / Header
        if branding and branding.uni:
            uni_p = doc.add_paragraph()
            run = uni_p.add_run(branding.uni.upper())
            run.bold = True
            run.font.size = Pt(24)
            uni_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
            if branding.dept:
                dept_p = doc.add_paragraph()
                run = dept_p.add_run(branding.dept)
                run.bold = True
                run.font.size = Pt(14)
                dept_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        else:
            title = doc.add_paragraph()
            run = title.add_run("AI EXAM GENERATOR - ASSESSMENT")
            run.bold = True
            run.font.size = Pt(20)
            run.font.color.rgb = RGBColor(225, 29, 72)
            title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        doc.add_paragraph(f"Session ID: {session_id}").alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_paragraph(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}").alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc_type_str = "ANSWER KEY" if is_answer_key else "QUESTION PAPER"
        doc.add_paragraph(f"DOCUMENT TYPE: {doc_type_str}").alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_paragraph("-" * 50).alignment = WD_ALIGN_PARAGRAPH.CENTER

        if is_answer_key:
            self._write_docx_answer_key(doc, questions)
        else:
            self._write_docx_question_paper(doc, questions, include_answers)

        # File Naming & Folder Structure
        export_dir = self._get_export_path(subject, "DOCX")
        doc_type_name = "AnswerKey" if is_answer_key else "Exam"
        filename = self._generate_clean_filename(subject, topic, doc_type_name, "docx")
        
        file_path = os.path.join(export_dir, filename)
        doc.save(file_path)
        return file_path

    def _write_docx_question_paper(self, doc, questions, include_answers):
        for i, q in enumerate(questions):
            p = doc.add_paragraph()
            p.add_run(f"Q{i+1}: ").bold = True
            p.add_run(q['question'])
            
            if q.get('type') == 'mcq' and 'options' in q:
                for opt in q['options']:
                    doc.add_paragraph(f"   {opt}", style='List Bullet')
            
            if include_answers:
                ans_p = doc.add_paragraph()
                ans_p.add_run("Answer: ").bold = True
                ans_p.add_run(str(q['answer']))
            
            doc.add_paragraph()

    def _write_docx_answer_key(self, doc, questions):
        for i, q in enumerate(questions):
            p = doc.add_paragraph()
            p.add_run(f"Q{i+1}: ").bold = True
            p.add_run(q['question'])
            
            ans_p = doc.add_paragraph()
            ans_p.add_run("Answer: ").bold = True
            ans_p.add_run(str(q['answer']))
            
            doc.add_paragraph()

    async def generate_pdf(self, session_id: str, questions: list, branding=None, is_answer_key=False, include_answers=True, subject="Exam", topic="Assessment") -> str:
        try:
            pdf = FPDF()
            pdf.set_auto_page_break(auto=True, margin=15)
            pdf.add_page()
            
            # Header
            if branding and branding.uni:
                pdf.set_font("Arial", 'B', 18)
                pdf.cell(0, 12, branding.uni.upper(), ln=True, align='C')
                if branding.dept:
                    pdf.set_font("Arial", 'B', 12)
                    pdf.cell(0, 8, branding.dept, ln=True, align='C')
            else:
                pdf.set_font("Arial", 'B', 16)
                pdf.set_text_color(225, 29, 72)
                pdf.cell(0, 10, "AI EXAM GENERATOR", ln=True, align='C')
            
            pdf.set_font("Arial", '', 9)
            pdf.set_text_color(100, 100, 100)
            doc_type_str = "ANSWER KEY" if is_answer_key else "QUESTION PAPER"
            pdf.cell(0, 10, f"Session: {session_id} | {doc_type_str} | {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=True, align='C')
            pdf.ln(5)
            pdf.line(10, pdf.get_y(), 200, pdf.get_y())
            pdf.ln(10)
            
            pdf.set_text_color(0, 0, 0)
            if is_answer_key:
                self._write_pdf_answer_key(pdf, questions)
            else:
                self._write_pdf_question_paper(pdf, questions, include_answers)

            # File Naming & Folder Structure
            export_dir = self._get_export_path(subject, "PDF")
            doc_type_name = "AnswerKey" if is_answer_key else "Exam"
            filename = self._generate_clean_filename(subject, topic, doc_type_name, "pdf")
            
            file_path = os.path.join(export_dir, filename)
            pdf.output(file_path)
            return file_path
        except Exception as e:
            logging.error(f"PDF error: {e}")
            raise e

    def _clean_text_for_pdf(self, text: str) -> str:
        """
        Replaces common unicode characters that standard FPDF fonts don't support.
        """
        if not text: return ""
        replacements = {
            '→': '->',
            '←': '<-',
            '•': '*',
            '—': '-',
            '–': '-',
            '“': '"',
            '”': '"',
            '‘': "'",
            '’': "'",
            '≥': '>=',
            '≤': '<=',
            '≠': '!=',
            '±': '+/-'
        }
        for char, replacement in replacements.items():
            text = text.replace(char, replacement)
        
        # Finally, encode and decode to latin-1 to strip any remaining stubborn characters
        return text.encode('latin-1', 'replace').decode('latin-1')

    def _write_pdf_question_paper(self, pdf, questions, include_answers):
        for i, q in enumerate(questions):
            pdf.set_font("Arial", 'B', 11)
            q_text = self._clean_text_for_pdf(q['question'])
            pdf.multi_cell(0, 7, f"Q{i+1}: {q_text}")
            
            pdf.set_font("Arial", '', 10)
            if q.get('type') == 'mcq' and 'options' in q:
                for opt in q['options']:
                    pdf.set_x(20)
                    opt_text = self._clean_text_for_pdf(opt)
                    pdf.multi_cell(0, 6, f"- {opt_text}")
            
            if include_answers:
                pdf.ln(2)
                pdf.set_font("Arial", 'B', 10)
                pdf.cell(20, 6, "Answer: ", ln=False)
                pdf.set_font("Arial", '', 10)
                ans_text = self._clean_text_for_pdf(str(q['answer']))
                pdf.multi_cell(0, 6, ans_text)
            
            pdf.ln(8)

    def _write_pdf_answer_key(self, pdf, questions):
        for i, q in enumerate(questions):
            pdf.set_font("Arial", 'B', 11)
            q_text = self._clean_text_for_pdf(q['question'])
            pdf.multi_cell(0, 7, f"Q{i+1}: {q_text}")
            
            pdf.ln(1)
            pdf.set_font("Arial", 'B', 10)
            pdf.cell(20, 6, "Answer: ", ln=False)
            pdf.set_font("Arial", '', 10)
            ans_text = self._clean_text_for_pdf(str(q['answer']))
            pdf.multi_cell(0, 6, ans_text)
            
            pdf.ln(6)

    def cleanup_exports(self, session_id: str):
        """
        Cleanup is now handled differently due to folder structure,
        but we keep the method for compatibility.
        """
        pass

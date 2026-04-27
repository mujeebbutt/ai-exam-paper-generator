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

    def generate_docx(self, session_id: str, questions: list, branding=None, student_info=None, is_answer_key=False, include_answers=True, subject="Exam", topic="Assessment", exam_title="Final Examination", time_limit="2 Hours", total_marks=100, passing_marks=40, passing_percentage=40, mcq_marks=1, short_marks=4, long_marks=10, prog_marks=15) -> str:
        doc = Document()
        
        # Header Table for Logo and Title
        table = doc.add_table(rows=1, cols=3)
        table.autofit = True
        
        # Logo (Left)
        if branding and branding.logo_path and os.path.exists(branding.logo_path):
            try:
                cell = table.cell(0, 0)
                paragraph = cell.paragraphs[0]
                run = paragraph.add_run()
                run.add_picture(branding.logo_path, width=Pt(60))
            except Exception as e:
                logging.error(f"Error adding logo to DOCX: {e}")

        # Title (Center)
        cell = table.cell(0, 1)
        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(exam_title.upper())
        run.bold = True
        run.font.size = Pt(20)
        
        # Branding Info (Right)
        if branding and branding.uni:
            cell = table.cell(0, 2)
            paragraph = cell.paragraphs[0]
            paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            run = paragraph.add_run(branding.uni)
            run.bold = True
            run.font.size = Pt(10)
            if branding.dept:
                paragraph.add_run(f"\n{branding.dept}")

        doc.add_paragraph() # Spacer
        
        # Student Info Section (if enabled)
        if student_info and getattr(student_info, 'enabled', False) and not is_answer_key:
            s_table = doc.add_table(rows=1, cols=2)
            s_table.autofit = True
            
            if getattr(student_info, 'show_name', True):
                p = s_table.cell(0, 0).paragraphs[0]
                p.add_run("STUDENT NAME: ").bold = True
                p.add_run("." * 60)
            
            if getattr(student_info, 'show_roll_no', True):
                p = s_table.cell(0, 1).paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                p.add_run("ROLL NO: ").bold = True
                p.add_run("." * 30)
            
            doc.add_paragraph() # Spacer after student info

        # Metadata Row
        meta_p = doc.add_paragraph()
        meta_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        meta_p.add_run(f"Subject: {subject} | Time: {time_limit}\n").bold = True
        meta_p.add_run(f"Total Marks: {total_marks} | Passing Marks: {passing_marks} ({passing_percentage}%)").bold = True
        
        doc.add_paragraph("-" * 80).alignment = WD_ALIGN_PARAGRAPH.CENTER

        if is_answer_key:
            doc.add_paragraph("ANSWER KEY").alignment = WD_ALIGN_PARAGRAPH.CENTER
            self._write_docx_answer_key(doc, questions)
        else:
            self._write_docx_question_paper(doc, questions, include_answers, mcq_marks, short_marks, long_marks, prog_marks)

        # File Naming & Folder Structure
        export_dir = self._get_export_path(subject, "DOCX")
        filename = f"{subject}_{total_marks}Marks.{'docx' if not is_answer_key else 'key.docx'}"
        filename = self._sanitize_filename(filename) + ".docx"
        
        file_path = os.path.join(export_dir, filename)
        doc.save(file_path)
        return file_path

    def _write_docx_question_paper(self, doc, questions, include_answers, mcq_marks, short_marks, long_marks, prog_marks):
        mcqs = [q for q in questions if q['type'].lower() == 'mcq']
        shorts = [q for q in questions if q['type'].lower() == 'short']
        longs = [q for q in questions if q['type'].lower() == 'long']
        progs = [q for q in questions if q['type'].lower() == 'programming']

        q_count = 1

        if mcqs:
            doc.add_paragraph(f"SECTION A: Multiple Choice Questions ({len(mcqs)} × {mcq_marks} = {len(mcqs)*mcq_marks} marks)").bold = True
            doc.add_paragraph("Instruction: Attempt all questions. Choose the correct option.").italic = True
            for q in mcqs:
                p = doc.add_paragraph()
                p.add_run(f"Q{q_count}. ").bold = True
                p.add_run(f"{q['question']} ({mcq_marks} mark)")
                if 'options' in q:
                    for opt in q['options']:
                        doc.add_paragraph(f"   {opt}")
                q_count += 1
            doc.add_paragraph()

        if shorts:
            doc.add_paragraph(f"SECTION B: Short Answer Questions ({len(shorts)} × {short_marks} = {len(shorts)*short_marks} marks)").bold = True
            doc.add_paragraph("Instruction: Attempt all questions. Answer briefly.").italic = True
            for q in shorts:
                p = doc.add_paragraph()
                p.add_run(f"Q{q_count}. ").bold = True
                p.add_run(f"{q['question']} ({short_marks} marks)")
                q_count += 1
            doc.add_paragraph()

        if longs:
            doc.add_paragraph(f"SECTION C: Long Answer Questions ({len(longs)} × {long_marks} = {len(longs)*long_marks} marks)").bold = True
            doc.add_paragraph("Instruction: Attempt all questions. Answer in detail.").italic = True
            for q in longs:
                p = doc.add_paragraph()
                p.add_run(f"Q{q_count}. ").bold = True
                p.add_run(f"{q['question']} ({long_marks} marks)")
                q_count += 1
            doc.add_paragraph()

        if progs:
            doc.add_paragraph(f"SECTION D: Programming Questions ({len(progs)} × {prog_marks} = {len(progs)*prog_marks} marks)").bold = True
            doc.add_paragraph("Instruction: Attempt all questions. Write clear and efficient code.").italic = True
            for q in progs:
                p = doc.add_paragraph()
                p.add_run(f"Q{q_count}. ").bold = True
                p.add_run(f"{q['question']} ({prog_marks} marks)")
                q_count += 1
            doc.add_paragraph()

    def _write_docx_answer_key(self, doc, questions):
        for i, q in enumerate(questions):
            p = doc.add_paragraph()
            p.add_run(f"Q{i+1}: ").bold = True
            p.add_run(f"Answer: {q['answer']}")
            doc.add_paragraph()

    async def generate_pdf(self, session_id: str, questions: list, branding=None, student_info=None, is_answer_key=False, include_answers=True, subject="Exam", topic="Assessment", exam_title="Final Examination", time_limit="2 Hours", total_marks=100, passing_marks=40, passing_percentage=40, mcq_marks=1, short_marks=4, long_marks=10, prog_marks=15) -> str:
        try:
            pdf = FPDF()
            pdf.set_auto_page_break(auto=True, margin=15)
            pdf.add_page()
            
            # Logo & Header
            y_start = pdf.get_y()
            if branding and branding.logo_path and os.path.exists(branding.logo_path):
                try:
                    pdf.image(branding.logo_path, 10, y_start, 25)
                except Exception as e:
                    logging.error(f"Error adding logo to PDF: {e}")
            
            pdf.set_font("Arial", 'B', 20)
            pdf.cell(0, 10, exam_title.upper(), ln=True, align='C')
            
            pdf.set_font("Arial", 'B', 12)
            if branding and branding.uni:
                pdf.cell(0, 8, branding.uni, ln=True, align='C')
                if branding.dept:
                    pdf.set_font("Arial", '', 10)
                    pdf.cell(0, 6, branding.dept, ln=True, align='C')
            
            pdf.ln(5)
            
            # Student Info Section (if enabled)
            if student_info and getattr(student_info, 'enabled', False) and not is_answer_key:
                pdf.set_font("Arial", 'B', 10)
                pdf.ln(2)
                if getattr(student_info, 'show_name', True):
                    pdf.cell(110, 8, "STUDENT NAME: " + "." * 60, ln=0)
                if getattr(student_info, 'show_roll_no', True):
                    if not getattr(student_info, 'show_name', True):
                        pdf.set_x(10)
                    else:
                        pdf.set_x(130)
                    pdf.cell(70, 8, "ROLL NO: " + "." * 30, ln=1, align='R')
                else:
                    pdf.ln(8)
                pdf.ln(4)

            pdf.set_font("Arial", 'B', 10)
            pdf.cell(0, 8, f"Subject: {subject} | Time: {time_limit}", ln=True, align='C')
            pdf.cell(0, 8, f"Total Marks: {total_marks} | Passing Marks: {passing_marks} ({passing_percentage}%)", ln=True, align='C')
            
            pdf.ln(2)
            pdf.line(10, pdf.get_y(), 200, pdf.get_y())
            pdf.ln(8)
            
            pdf.set_text_color(0, 0, 0)
            if is_answer_key:
                pdf.set_font("Arial", 'B', 14)
                pdf.cell(0, 10, "ANSWER KEY", ln=True, align='C')
                pdf.ln(5)
                self._write_pdf_answer_key(pdf, questions)
            else:
                self._write_pdf_question_paper(pdf, questions, include_answers, mcq_marks, short_marks, long_marks, prog_marks)

            # File Naming & Folder Structure
            export_dir = self._get_export_path(subject, "PDF")
            filename = f"{subject}_{total_marks}Marks.{'pdf' if not is_answer_key else 'key.pdf'}"
            filename = self._sanitize_filename(filename) + ".pdf"
            
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

    def _write_pdf_question_paper(self, pdf, questions, include_answers, mcq_marks, short_marks, long_marks, prog_marks):
        mcqs = [q for q in questions if q['type'].lower() == 'mcq']
        shorts = [q for q in questions if q['type'].lower() == 'short']
        longs = [q for q in questions if q['type'].lower() == 'long']
        progs = [q for q in questions if q['type'].lower() == 'programming']

        q_count = 1

        if mcqs:
            pdf.set_font("Arial", 'B', 12)
            pdf.cell(0, 10, f"SECTION A: Multiple Choice Questions ({len(mcqs)} x {mcq_marks} = {len(mcqs)*mcq_marks} marks)", ln=True)
            pdf.set_font("Arial", 'I', 10)
            pdf.cell(0, 8, "Instruction: Attempt all questions. Choose the correct option.", ln=True)
            pdf.ln(2)
            for q in mcqs:
                pdf.set_font("Arial", 'B', 11)
                q_text = self._clean_text_for_pdf(q['question'])
                pdf.multi_cell(0, 7, f"Q{q_count}. {q_text} ({mcq_marks} mark)")
                pdf.set_font("Arial", '', 10)
                if 'options' in q:
                    for opt in q['options']:
                        pdf.set_x(20)
                        opt_text = self._clean_text_for_pdf(opt)
                        pdf.multi_cell(0, 6, opt_text)
                q_count += 1
                pdf.ln(4)
            pdf.ln(5)

        if shorts:
            pdf.set_font("Arial", 'B', 12)
            pdf.cell(0, 10, f"SECTION B: Short Answer Questions ({len(shorts)} x {short_marks} = {len(shorts)*short_marks} marks)", ln=True)
            pdf.set_font("Arial", 'I', 10)
            pdf.cell(0, 8, "Instruction: Attempt all questions. Answer briefly.", ln=True)
            pdf.ln(2)
            for q in shorts:
                pdf.set_font("Arial", 'B', 11)
                q_text = self._clean_text_for_pdf(q['question'])
                pdf.multi_cell(0, 7, f"Q{q_count}. {q_text} ({short_marks} marks)")
                q_count += 1
                pdf.ln(4)
            pdf.ln(5)

        if longs:
            pdf.set_font("Arial", 'B', 12)
            pdf.cell(0, 10, f"SECTION C: Long Answer Questions ({len(longs)} x {long_marks} = {len(longs)*long_marks} marks)", ln=True)
            pdf.set_font("Arial", 'I', 10)
            pdf.cell(0, 8, "Instruction: Attempt all questions. Answer in detail.", ln=True)
            pdf.ln(2)
            for q in longs:
                pdf.set_font("Arial", 'B', 11)
                q_text = self._clean_text_for_pdf(q['question'])
                pdf.multi_cell(0, 7, f"Q{q_count}. {q_text} ({long_marks} marks)")
                q_count += 1
                pdf.ln(4)
            pdf.ln(5)

        if progs:
            pdf.set_font("Arial", 'B', 12)
            pdf.cell(0, 10, f"SECTION D: Programming Questions ({len(progs)} x {prog_marks} = {len(progs)*prog_marks} marks)", ln=True)
            pdf.set_font("Arial", 'I', 10)
            pdf.cell(0, 8, "Instruction: Attempt all questions. Write clear and efficient code.", ln=True)
            pdf.ln(2)
            for q in progs:
                pdf.set_font("Arial", 'B', 11)
                q_text = self._clean_text_for_pdf(q['question'])
                pdf.multi_cell(0, 7, f"Q{q_count}. {q_text} ({prog_marks} marks)")
                q_count += 1
                pdf.ln(4)
            pdf.ln(5)

    def _write_pdf_answer_key(self, pdf, questions):
        for i, q in enumerate(questions):
            pdf.set_font("Arial", 'B', 11)
            pdf.multi_cell(0, 7, f"Q{i+1}: Answer: {self._clean_text_for_pdf(str(q['answer']))}")
            pdf.ln(4)

    def cleanup_exports(self, session_id: str):
        """
        Cleanup is now handled differently due to folder structure,
        but we keep the method for compatibility.
        """
        pass

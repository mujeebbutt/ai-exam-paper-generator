import json
import os
import logging
import google.generativeai as genai
from dotenv import load_dotenv
import re
from typing import List, Union, Dict

load_dotenv()

class LLMService:
    def __init__(self, model_name: str = "gemini-flash-latest"):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            logging.error("GEMINI_API_KEY not found in environment variables!")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(model_name)

    async def generate_response(self, prompt: str, system_prompt: str = "", images: List = None) -> str:
        """
        Sends a prompt (and optional images for OCR) to Gemini API.
        """
        if not self.api_key:
            return json.dumps({"error": "Gemini API key is missing."})

        try:
            content = []
            if system_prompt:
                content.append(system_prompt)
            
            content.append(f"\n\nUser Request: {prompt}")
            
            if images:
                # Add images to the content list for multi-modal processing
                # images should be a list of PIL Image objects or bytes
                for img in images:
                    content.append(img)
            
            response = self.model.generate_content(
                content,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json"
                )
            )
            
            return response.text
        except Exception as e:
            logging.error(f"Gemini Generation Error: {e}")
            return json.dumps({"error": str(e)})

    def parse_json_response(self, response_text: str) -> list:
        """
        Parses the JSON response from Gemini with robustness.
        """
        try:
            cleaned_text = response_text.strip()
            if "```json" in cleaned_text:
                cleaned_text = re.search(r'```json\s*(.*?)\s*```', cleaned_text, re.DOTALL).group(1)
            elif "```" in cleaned_text:
                cleaned_text = re.search(r'```\s*(.*?)\s*```', cleaned_text, re.DOTALL).group(1)
            
            data = json.loads(cleaned_text)
            if isinstance(data, list): return data
            if isinstance(data, dict):
                for key in ["questions", "mcqs", "short_questions", "items"]:
                    if key in data and isinstance(data[key], list):
                        return data[key]
                if "question" in data: return [data]
            return []
        except Exception as e:
            logging.error(f"JSON Parsing Error: {e}")
            return []

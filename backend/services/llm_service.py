import json
import os
import logging
from dotenv import load_dotenv
import re
from typing import List, Union, Dict

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(env_path, override=True)
try:
    from google import genai
    from google.genai import types as genai_types
    _USE_NEW_SDK = True
except ImportError:
    import google.generativeai as genai_legacy
    _USE_NEW_SDK = False

class LLMService:
    def __init__(self, model_name: str = "gemini-2.5-flash"):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.model_name = model_name
        self.mock_mode = os.getenv("MOCK_MODE", "false").lower() == "true"

        if self.mock_mode:
            logging.info("LLMService initialized in MOCK MODE")
            return

        if not self.api_key:
            logging.error("GEMINI_API_KEY not found in environment variables!")
            return

        if _USE_NEW_SDK:
            self.client = genai.Client(api_key=self.api_key)
            logging.info("LLMService using google.genai (new SDK)")
        else:
            genai_legacy.configure(api_key=self.api_key)
            self.model = genai_legacy.GenerativeModel(model_name)
            logging.info("LLMService using google.generativeai (legacy SDK)")

    async def generate_response(self, prompt: str, system_prompt: str = "", images: List = None) -> str:
        """
        Sends a prompt to Gemini API or returns mock data if MOCK_MODE is enabled.
        """
        if self.mock_mode:
            return self._get_mock_response(prompt)

        if not self.api_key:
            return json.dumps({"error": "Gemini API key is missing."})

        try:
            parts = []
            if system_prompt:
                parts.append(system_prompt)
            parts.append(f"\n\nUser Request: {prompt}")
            if images:
                for img in images:
                    parts.append(img)

            import asyncio
            from google.api_core.exceptions import ResourceExhausted

            max_retries = 3
            delays = [2, 4, 8]
            
            for attempt in range(max_retries + 1):
                try:
                    if _USE_NEW_SDK:
                        config = genai_types.GenerateContentConfig(
                            response_mime_type="application/json"
                        )
                        response = self.client.models.generate_content(
                            model=self.model_name,
                            contents=parts,
                            config=config
                        )
                        return response.text
                    else:
                        response = self.model.generate_content(
                            parts,
                            generation_config=genai_legacy.GenerationConfig(
                                response_mime_type="application/json"
                            )
                        )
                        return response.text
                except Exception as e:
                    error_str = str(e)
                    # Check if it's a 429 quota error
                    if "429" in error_str or "ResourceExhausted" in error_str or "quota" in error_str.lower():
                        if attempt < max_retries:
                            logging.warning(f"Gemini API 429 Quota Error. Retrying in {delays[attempt]} seconds... (Attempt {attempt+1}/{max_retries})")
                            await asyncio.sleep(delays[attempt])
                            continue
                        else:
                            logging.error("Gemini API rate limit exceeded after maximum retries.")
                            return json.dumps({"error": "Gemini API Quota Exceeded. You have hit your rate limit. Please wait, or enable MOCK_MODE=true in backend/.env to continue testing."})
                    else:
                        # For other errors, don't retry, just return
                        logging.error(f"Gemini Generation Error: {e}")
                        return json.dumps({"error": str(e)})

        except Exception as e:
            logging.error(f"Gemini Setup Error: {e}")
            return json.dumps({"error": "Generation temporarily unavailable. Please try again in a few seconds."})


    def _get_mock_response(self, prompt: str) -> str:
        """
        Generates realistic dummy questions for testing without API usage.
        Accurately parses requested counts from the prompt.
        """
        import re
        
        # Extract counts from prompt
        mcq_match = re.search(r'(\d+) Multiple Choice', prompt)
        short_match = re.search(r'(\d+) Short Answer', prompt)
        long_match = re.search(r'(\d+) Long/Essay', prompt)
        
        mcq_count = int(mcq_match.group(1)) if mcq_match else 0
        short_count = int(short_match.group(1)) if short_match else 0
        long_count = int(long_match.group(1)) if long_match else 0
        
        # Check for INSUFFICIENT CONTENT simulation
        if "empty" in prompt.lower():
            return "INSUFFICIENT CONTENT"

        mock_pool = [
            {
                "question": "What is the primary advantage of a microservices architecture compared to a monolithic design?",
                "options": ["A) Simpler deployment", "B) Better scalability", "C) Lower latency", "D) Reduced complexity"],
                "answer": "B",
                "explanation": "Microservices allow individual components to scale independently."
            },
            {
                "question": "Which of the following best describes the principle of 'Separation of Concerns'?",
                "options": ["A) Encapsulating data", "B) Minimizing code", "C) Dividing a program into distinct sections", "D) Improving UI speed"],
                "answer": "C",
                "explanation": "Separation of concerns ensures that each part of the code handles a specific responsibility."
            },
            {
                "question": "What is the role of an API Gateway in a modern web ecosystem?",
                "options": ["A) Database storage", "B) Front-end rendering", "C) Request routing and load balancing", "D) Code compilation"],
                "answer": "C",
                "explanation": "An API Gateway acts as a single entry point for all client requests."
            },
            {
                "question": "Define 'Scalability' in the context of high-traffic web applications.",
                "options": ["A) Fixed performance", "B) Ability to handle growth", "C) Code portability", "D) Visual design"],
                "answer": "B",
                "explanation": "Scalability is the property of a system to handle a growing amount of work."
            }
        ]

        mock_questions = []
        
        # MCQs
        for i in range(mcq_count):
            q_template = mock_pool[i % len(mock_pool)]
            mock_questions.append({
                "type": "mcq",
                "question": q_template["question"],
                "options": q_template["options"],
                "answer": q_template["answer"],
                "explanation": q_template["explanation"]
            })
            
        # Shorts pool — all meaningfully different
        short_pool = [
            {
                "question": "Explain the principle of 'Loose Coupling' and why it is important in software design.",
                "answer": "Loose coupling minimizes interdependencies between modules, making the system easier to maintain, test, and extend independently.",
                "explanation": "Tests understanding of modular design."
            },
            {
                "question": "What distinguishes synchronous communication from asynchronous communication in distributed systems?",
                "answer": "Synchronous communication blocks the caller until a response is received, while asynchronous communication allows the caller to continue without waiting.",
                "explanation": "Tests knowledge of communication patterns."
            },
            {
                "question": "Define 'Technical Debt' and describe its long-term implications on a software project.",
                "answer": "Technical debt refers to the implied cost of future rework caused by choosing a quick solution now instead of a better approach. It slows velocity over time.",
                "explanation": "Evaluates awareness of engineering trade-offs."
            },
            {
                "question": "Describe the role of a message queue in a microservices architecture.",
                "answer": "A message queue decouples producers and consumers, enabling asynchronous processing, load levelling, and fault tolerance between services.",
                "explanation": "Tests architectural knowledge."
            },
            {
                "question": "What is the purpose of a database index and what are its trade-offs?",
                "answer": "An index speeds up read queries by creating a data structure for fast lookups, but increases write overhead and storage consumption.",
                "explanation": "Evaluates database optimization knowledge."
            },
            {
                "question": "Distinguish between horizontal and vertical scaling strategies.",
                "answer": "Horizontal scaling adds more machines to a pool, while vertical scaling increases the capacity of an existing machine. Horizontal scaling is generally more resilient.",
                "explanation": "Tests infrastructure knowledge."
            },
            {
                "question": "Explain the concept of 'Idempotency' in the context of REST APIs.",
                "answer": "An idempotent operation produces the same result regardless of how many times it is executed. GET, PUT, and DELETE are idempotent; POST is not.",
                "explanation": "Tests API design principles."
            },
            {
                "question": "What is 'Eventual Consistency' and when is it an acceptable trade-off?",
                "answer": "Eventual consistency guarantees that all replicas of data will converge to the same value over time. It is acceptable in systems that prioritize availability over strict data accuracy.",
                "explanation": "Tests distributed systems knowledge."
            },
        ]

        # Longs pool — all meaningfully different
        long_pool = [
            {
                "question": "Critically evaluate the trade-offs between a monolithic and a microservices architecture for a rapidly scaling e-commerce platform.",
                "answer": "A monolith offers simplicity and low initial complexity, but struggles with scaling individual bottlenecks. Microservices allow independent scaling and deployment but introduce network overhead, service discovery, and distributed tracing complexity.",
                "marking_scheme": "1. Monolith advantages/disadvantages (3 pts)\n2. Microservices advantages/disadvantages (3 pts)\n3. Context-specific recommendation (4 pts)",
                "explanation": "Evaluates advanced architectural reasoning."
            },
            {
                "question": "Design a caching strategy for a high-traffic content delivery system and justify each architectural decision.",
                "answer": "Use a CDN for static assets, a distributed cache (e.g. Redis) for session data and frequently-read database results, and cache invalidation policies such as TTL and event-driven invalidation.",
                "marking_scheme": "1. CDN usage justification (2 pts)\n2. In-memory cache design (3 pts)\n3. Invalidation strategy (3 pts)\n4. Failure handling (2 pts)",
                "explanation": "Tests system design and justification skills."
            },
            {
                "question": "Analyze how the CAP theorem influences database selection for a globally distributed financial application.",
                "answer": "The CAP theorem states a distributed system can guarantee only two of Consistency, Availability, and Partition Tolerance. Financial systems typically require Consistency and Partition Tolerance, favoring CP databases such as Spanner or CockroachDB.",
                "marking_scheme": "1. CAP theorem explanation (3 pts)\n2. Financial system requirements (3 pts)\n3. Specific database recommendation and justification (4 pts)",
                "explanation": "Tests theoretical and applied database knowledge."
            },
        ]

        # Shorts
        for i in range(short_count):
            q = short_pool[i % len(short_pool)]
            mock_questions.append({
                "type": "short",
                "question": q["question"],
                "answer": q["answer"],
                "explanation": q["explanation"]
            })

        # Longs
        for i in range(long_count):
            q = long_pool[i % len(long_pool)]
            mock_questions.append({
                "type": "long",
                "question": q["question"],
                "answer": q["answer"],
                "marking_scheme": q["marking_scheme"],
                "explanation": q["explanation"]
            })
            
        return json.dumps(mock_questions)

    def parse_json_response(self, response_text: str, raw: bool = False) -> list:
        """
        Parses the JSON response from Gemini with robustness.
        If raw=True, returns the cleaned JSON string (for dict responses like concept extraction).
        """
        try:
            cleaned_text = response_text.strip()
            if "```json" in cleaned_text:
                cleaned_text = re.search(r'```json\s*(.*?)\s*```', cleaned_text, re.DOTALL).group(1)
            elif "```" in cleaned_text:
                cleaned_text = re.search(r'```\s*(.*?)\s*```', cleaned_text, re.DOTALL).group(1)
            
            if raw:
                return cleaned_text  # Caller handles json.loads() themselves

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
            return [] if not raw else "{}"

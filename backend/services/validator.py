class Validator:
    BANNED_PHRASES = [
        "sample", "mock", "according to", "uploaded file", 
        "this file", "the document", "attached content",
        "provided text", "based on the file"
    ]

    @staticmethod
    def validate_question(q_data: dict) -> bool:
        required_fields = ['type', 'question', 'answer']
        if q_data.get('type') == 'mcq':
            required_fields.append('options')
            if not isinstance(q_data.get('options'), list) or len(q_data['options']) != 4:
                return False
        return all(field in q_data for field in required_fields)

    @classmethod
    def validate_quality(cls, text: str) -> bool:
        """
        Returns False if the text contains any unprofessional or placeholder phrases.
        """
        lowered_text = text.lower()
        for phrase in cls.BANNED_PHRASES:
            if phrase in lowered_text:
                return False
        return True

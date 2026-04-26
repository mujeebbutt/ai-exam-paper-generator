class BloomClassifier:
    @staticmethod
    def classify(q_text: str, difficulty: str) -> str:
        q_lower = q_text.lower()
        if any(word in q_lower for word in ['define', 'list', 'state']):
            return 'Remember'
        elif any(word in q_lower for word in ['explain', 'describe']):
            return 'Understand'
        return 'Apply'

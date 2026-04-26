class Validator:
    @staticmethod
    def validate_question(q_data: dict) -> bool:
        required_fields = ['type', 'question', 'answer']
        if q_data.get('type') == 'mcq':
            required_fields.append('options')
            if not isinstance(q_data.get('options'), list) or len(q_data['options']) != 4:
                return False
        return all(field in q_data for field in required_fields)

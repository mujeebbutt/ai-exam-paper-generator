class Deduplicator:
    @staticmethod
    def is_duplicate(new_q: str, existing_qs: list) -> bool:
        new_q_lower = new_q.lower()
        for q in existing_qs:
            if new_q_lower == q.lower():
                return True
        return False

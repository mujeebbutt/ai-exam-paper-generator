class Deduplicator:
    @staticmethod
    def is_duplicate(new_q: str, existing_qs: list) -> bool:
        """
        Checks for exact or very similar duplicates using basic word set overlap.
        """
        new_q_clean = "".join(e for e in new_q.lower() if e.isalnum() or e.isspace())
        new_words = set(new_q_clean.split())
        
        for q in existing_qs:
            q_clean = "".join(e for e in q.lower() if e.isalnum() or e.isspace())
            existing_words = set(q_clean.split())
            
            # Simple Jaccard similarity
            intersection = new_words.intersection(existing_words)
            union = new_words.union(existing_words)
            if not union: continue
            
            similarity = len(intersection) / len(union)
            if similarity > 0.8: # 80% word overlap is usually a repeat
                return True
        return False

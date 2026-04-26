import chromadb
from chromadb.utils import embedding_functions
from typing import List, Dict
import uuid
import os

class VectorStore:
    def __init__(self):
        # Initialize persistent ChromaDB client
        self.db_path = "./data/chroma_db"
        os.makedirs(self.db_path, exist_ok=True)
        self.client = chromadb.PersistentClient(path=self.db_path)
        
        # Use sentence-transformers for local embeddings
        self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 100) -> List[str]:
        """
        Splits text into overlapping chunks.
        """
        if not text:
            return []
            
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunks.append(text[start:end])
            start += chunk_size - overlap
            
        return chunks

    def store_document(self, session_id: str, text: str):
        """
        Chunks and stores document text in a session-specific collection.
        """
        chunks = self.chunk_text(text)
        if not chunks:
            return
            
        # Create or get collection for this session
        collection = self.client.get_or_create_collection(
            name=f"session_{session_id.replace('-', '_')}",
            embedding_function=self.embedding_fn
        )
        
        # Prepare IDs and metadata
        ids = [f"chunk_{i}" for i in range(len(chunks))]
        metadatas = [{"session_id": session_id} for _ in chunks]
        
        # Add to collection
        collection.add(
            documents=chunks,
            ids=ids,
            metadatas=metadatas
        )

    def query(self, session_id: str, query_text: str, n_results: int = 5) -> List[str]:
        """
        Retrieves top-k relevant chunks for a given query.
        """
        try:
            collection = self.client.get_collection(
                name=f"session_{session_id.replace('-', '_')}",
                embedding_function=self.embedding_fn
            )
            
            results = collection.query(
                query_texts=[query_text],
                n_results=n_results
            )
            
            # Return flat list of documents
            return results['documents'][0] if results['documents'] else []
        except Exception:
            # Collection might not exist yet
            return []

    def delete_session_collection(self, session_id: str):
        """
        Cleans up ChromaDB collection after session expires.
        """
        try:
            self.client.delete_collection(name=f"session_{session_id.replace('-', '_')}")
        except Exception:
            pass

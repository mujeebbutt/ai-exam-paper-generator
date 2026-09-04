import chromadb
from chromadb.utils import embedding_functions
from typing import List, Dict
import uuid
import os
import time
import logging

logger = logging.getLogger(__name__)

# How long to wait after a failed init attempt before trying again automatically on next use.
# Keeps a genuinely-down dependency from being re-attempted (and re-logged) on every single
# request, while still recovering on its own — no redeploy needed — if the underlying issue
# (a Railway volume remount, a transient network blip, an HF Hub rate limit) clears up by itself.
_RETRY_COOLDOWN_SECONDS = 60
# Caps how often the "still unavailable" warning repeats while init stays broken, so Railway's
# log doesn't get one line per request under real traffic — just one per this interval.
_WARN_LOG_INTERVAL_SECONDS = 60


class VectorStore:
    def __init__(self):
        # Deliberately does NOT touch Chroma or load the embedding model here — see
        # _ensure_initialized() below. This constructor must never be able to raise: it runs at
        # import time (`vector_store = VectorStore()` in routers/generate.py), so a raise here
        # used to crash the entire app — auth, pricing pages, everything — over a Chroma/
        # embedding-model hiccup that has nothing to do with most of the product.
        BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
        default_path = os.path.join(BASE_DIR, "data", "chroma_db")
        # Same ephemeral-filesystem problem as the SQLite DB: this needs to live on a mounted
        # Railway Volume in production, or it's wiped on every redeploy. Configurable via
        # CHROMA_PERSIST_DIR instead of hardcoded, so it can point at the volume's mount path;
        # falls back to the local dev path when unset.
        self.db_path = os.environ.get("CHROMA_PERSIST_DIR", default_path)

        self.client = None
        self.embedding_fn = None
        self._available = False
        self._last_init_attempt = 0.0
        self._last_init_error = None
        self._last_warn_log_time = 0.0

    def _ensure_initialized(self) -> bool:
        """Connects to Chroma and loads the embedding model on first real use, not at import
        time. Returns True if the store is usable right now. Idempotent/cheap once successfully
        initialized (just returns True); while broken, retries at most once per
        _RETRY_COOLDOWN_SECONDS instead of on every call, so a persistently-down dependency
        doesn't get hammered (or spam the log) on every request."""
        if self._available:
            return True

        now = time.monotonic()
        if self._last_init_attempt and (now - self._last_init_attempt) < _RETRY_COOLDOWN_SECONDS:
            if (now - self._last_warn_log_time) >= _WARN_LOG_INTERVAL_SECONDS:
                logger.warning(
                    f"VectorStore unavailable (last error: {self._last_init_error}); "
                    f"still in retry cooldown, skipping re-attempt."
                )
                self._last_warn_log_time = now
            return False

        self._last_init_attempt = now

        try:
            os.makedirs(self.db_path, exist_ok=True)
        except Exception as e:
            self._last_init_error = f"could not create persist directory {self.db_path!r}: {e}"
            logger.error(f"VectorStore init failed — {self._last_init_error}")
            return False

        try:
            self.client = chromadb.PersistentClient(path=self.db_path)
        except Exception as e:
            self._last_init_error = f"chromadb.PersistentClient failed: {e}"
            logger.error(f"VectorStore init failed — {self._last_init_error}", exc_info=True)
            self.client = None
            return False

        try:
            self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name="all-MiniLM-L6-v2"
            )
        except Exception as e:
            self._last_init_error = f"SentenceTransformerEmbeddingFunction failed: {e}"
            logger.error(f"VectorStore init failed — {self._last_init_error}", exc_info=True)
            # A client with no usable embedding function isn't usable either — don't leave a
            # half-initialized client sitting around for a later call to trip over.
            self.embedding_fn = None
            self.client = None
            return False

        self._available = True
        self._last_init_error = None
        logger.info("VectorStore initialized successfully.")
        return True

    @property
    def is_available(self) -> bool:
        """Last-known health status without forcing a (re)connect attempt. Use
        _ensure_initialized() (via query()/store_document(), or get_health() for an active
        check) when you actually need the store to be usable right now."""
        return self._available

    def get_health(self) -> Dict:
        """Active health check: attempts (re)initialization if not already available (subject to
        the same retry cooldown as every other call), then reports the result. Wired into
        GET /api/status (main.py). Cheap to call repeatedly — a healthy store is a no-op, an
        unhealthy one is cooldown-limited the same as any other call site."""
        available = self._ensure_initialized()
        return {"available": available, "last_error": self._last_init_error}

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
        if not self._ensure_initialized():
            logger.warning(f"store_document skipped for session {session_id}: vector store unavailable.")
            return

        chunks = self.chunk_text(text)
        if not chunks:
            return

        try:
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
        except Exception as e:
            # A failure here (e.g. the client going stale mid-process) shouldn't 500 the whole
            # /api/generate request — generation still proceeds without this document indexed;
            # see generate.py's context_text fallback ("See attached images") for large docs.
            logger.error(f"store_document failed for session {session_id}: {e}", exc_info=True)

    def query(self, session_id: str, query_text: str, n_results: int = 5) -> List[str]:
        """
        Retrieves top-k relevant chunks for a given query.
        """
        if not self._ensure_initialized():
            return []
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
        if not self._ensure_initialized():
            return
        try:
            self.client.delete_collection(name=f"session_{session_id.replace('-', '_')}")
        except Exception:
            pass

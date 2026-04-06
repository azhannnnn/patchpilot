"""MemoryAgent: FAISS vector similarity + Firestore fingerprint storage"""
import hashlib, json, os, pickle, re
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import numpy as np
from google.cloud import firestore

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False

FAISS_INDEX_PATH = "/tmp/pp_faiss.index"
FAISS_META_PATH  = "/tmp/pp_faiss_meta.pkl"
EMBEDDING_DIM    = 128
db = firestore.Client()


def _embed(text: str, dim: int = EMBEDDING_DIM) -> np.ndarray:
    vec = np.zeros(dim, dtype=np.float32)
    for i, word in enumerate(text.lower().split()[:dim]):
        h = int(hashlib.md5(word.encode()).hexdigest(), 16)
        vec[i % dim] += (h % 1000) / 1000.0
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec


def compute_fingerprint(alert_title: str, service: str, root_cause: str = "") -> str:
    normalized = re.sub(r'\d+', 'N', f"{service}:{alert_title}:{root_cause}".lower())
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


class MemoryAgent:
    def __init__(self):
        self.index = None
        self.metadata: List[Dict] = []
        self._load_or_init()

    def _load_or_init(self):
        if not FAISS_AVAILABLE:
            return
        if os.path.exists(FAISS_INDEX_PATH) and os.path.exists(FAISS_META_PATH):
            try:
                self.index = faiss.read_index(FAISS_INDEX_PATH)
                with open(FAISS_META_PATH, "rb") as f:
                    self.metadata = pickle.load(f)
                return
            except Exception:
                pass
        self.index = faiss.IndexFlatL2(EMBEDDING_DIM)
        self.metadata = []

    def _save(self):
        if not FAISS_AVAILABLE or self.index is None:
            return
        try:
            faiss.write_index(self.index, FAISS_INDEX_PATH)
            with open(FAISS_META_PATH, "wb") as f:
                pickle.dump(self.metadata, f)
        except Exception:
            pass

    def store_incident(self, incident_id: str, alert_title: str, service: str,
                       root_cause: str, resolution_steps: List[str],
                       fingerprint: str, success: bool = True) -> None:
        text = f"{alert_title} {service} {root_cause}"
        embedding = _embed(text)
        if FAISS_AVAILABLE and self.index is not None:
            self.index.add(np.array([embedding]))
            self.metadata.append({
                "incident_id": incident_id, "alert_title": alert_title,
                "service": service, "root_cause": root_cause,
                "resolution_steps": resolution_steps, "fingerprint": fingerprint,
                "success": success, "stored_at": datetime.utcnow().isoformat()
            })
            self._save()
        try:
            db.collection("incident_memory").document(fingerprint).set({
                "incident_id": incident_id, "alert_title": alert_title,
                "service": service, "root_cause": root_cause,
                "resolution_steps": resolution_steps, "fingerprint": fingerprint,
                "success": success, "occurrence_count": firestore.Increment(1),
                "last_seen": datetime.utcnow().isoformat(),
                "stored_at": datetime.utcnow().isoformat()
            }, merge=True)
        except Exception:
            pass

    def find_similar(self, alert_title: str, service: str, top_k: int = 3) -> Tuple[List[Dict], bool, Optional[Dict]]:
        fingerprint = compute_fingerprint(alert_title, service)
        try:
            doc = db.collection("incident_memory").document(fingerprint).get()
            if doc.exists:
                data = doc.to_dict()
                if data.get("success") and data.get("occurrence_count", 0) >= 1:
                    return [data], True, data
        except Exception:
            pass
        similar = []
        if FAISS_AVAILABLE and self.index is not None and self.index.ntotal > 0:
            embedding = _embed(f"{alert_title} {service}")
            k = min(top_k, self.index.ntotal)
            distances, indices = self.index.search(np.array([embedding]), k)
            for dist, idx in zip(distances[0], indices[0]):
                if idx < len(self.metadata):
                    similar.append(self.metadata[idx])
        return similar, False, None

    def get_repeat_count(self, fingerprint: str) -> int:
        try:
            doc = db.collection("incident_memory").document(fingerprint).get()
            return doc.to_dict().get("occurrence_count", 0) if doc.exists else 0
        except Exception:
            return 0

    def stats(self) -> Dict:
        return {
            "faiss_index_size": self.index.ntotal if self.index else 0,
            "metadata_count": len(self.metadata),
            "status": "healthy"
        }


memory_agent = MemoryAgent()

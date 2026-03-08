import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_model = None
_use_tfidf_fallback = False


def _get_model():
    global _model, _use_tfidf_fallback
    if _model is not None:
        return _model
    if _use_tfidf_fallback:
        return None
    project_root = Path(__file__).resolve().parent.parent.parent
    local_cache = project_root / ".cache" / "huggingface"
    local_cache.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(local_cache))
    os.environ.setdefault("TRANSFORMERS_CACHE", str(local_cache))

    try:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading sentence-transformers model (all-MiniLM-L6-v2)...")
        _model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        return _model
    except (ImportError, OSError, PermissionError) as e:
        logger.warning(
            f"sentence-transformers unavailable ({e}). Using TF-IDF fallback for clustering. "
            "Install with: pip install sentence-transformers"
        )
        _use_tfidf_fallback = True
        return None


@dataclass
class Cluster:
    market_ids: list[str]
    questions: list[str]
    mean_embedding: Optional[list[float]] = None

    def __len__(self) -> int:
        return len(self.market_ids)


def _cluster_with_tfidf(
    questions: list[str],
    id_list: list[str],
    similarity_threshold: float,
    min_cluster_size: int,
) -> list[Cluster]:
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
    except ImportError:
        logger.warning(
            "sklearn not installed. Clustering skipped. "
            "Install with: pip install scikit-learn (or pip install -r requirements.txt)"
        )
        return []

    vectorizer = TfidfVectorizer(max_features=5000, stop_words="english", ngram_range=(1, 2))
    tfidf = vectorizer.fit_transform(questions)
    sim_matrix = cosine_similarity(tfidf, tfidf)
    n = len(questions)
    parent = list(range(n))

    def find(x: int) -> int:
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(x: int, y: int) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    for i in range(n):
        for j in range(i + 1, n):
            if sim_matrix[i][j] >= similarity_threshold:
                union(i, j)

    clusters_dict: dict[int, list[int]] = {}
    for i in range(n):
        root = find(i)
        if root not in clusters_dict:
            clusters_dict[root] = []
        clusters_dict[root].append(i)

    clusters = []
    for indices in clusters_dict.values():
        if len(indices) < min_cluster_size:
            continue
        mean_emb = None
        clusters.append(
            Cluster(
                market_ids=[id_list[i] for i in indices],
                questions=[questions[i] for i in indices],
                mean_embedding=mean_emb,
            )
        )
    return clusters


def cluster_markets(
    markets: list,
    similarity_threshold: float = 0.75,
    min_cluster_size: int = 2,
) -> list[Cluster]:
    if len(markets) < 2:
        return []

    questions = [m.question for m in markets]
    id_list = [m.id for m in markets]
    model = _get_model()

    if model is None:
        return _cluster_with_tfidf(
            questions, id_list,
            similarity_threshold=max(0.5, similarity_threshold - 0.15),
            min_cluster_size=min_cluster_size,
        )
    logger.info(f"Encoding {len(questions)} market questions...")
    embeddings = model.encode(questions, show_progress_bar=False)

    # Cosine similarity matrix
    from sentence_transformers import util

    sim_matrix = util.cos_sim(embeddings, embeddings)
    parent = list(range(len(markets)))

    def find(x: int) -> int:
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(x: int, y: int) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    for i in range(len(markets)):
        for j in range(i + 1, len(markets)):
            if sim_matrix[i][j].item() >= similarity_threshold:
                union(i, j)
    clusters_dict: dict[int, list[int]] = {}
    for i in range(len(markets)):
        root = find(i)
        if root not in clusters_dict:
            clusters_dict[root] = []
        clusters_dict[root].append(i)

    clusters = []
    for indices in clusters_dict.values():
        if len(indices) < min_cluster_size:
            continue
        cluster_market_ids = [id_list[i] for i in indices]
        cluster_questions = [questions[i] for i in indices]
        mean_emb = embeddings[indices].mean(axis=0).tolist()
        clusters.append(
            Cluster(
                market_ids=cluster_market_ids,
                questions=cluster_questions,
                mean_embedding=mean_emb,
            )
        )

    logger.info(f"Found {len(clusters)} clusters of related markets")
    return clusters

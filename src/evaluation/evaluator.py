"""Avaliação do sistema de recomendação.

Implementa:
- Split treino/teste por usuário.
- Métricas: Precision@N, Recall@N, nDCG@N (média sobre usuários).
- Baselines: recomendação aleatória e itens mais populares.
- Métrica de cobertura (fração do catálogo recomendável).
"""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd

from ..models.recommender import ContentBasedRecommender


def train_test_split(
    recommendations: pd.DataFrame,
    test_size: float = 0.2,
    min_interactions: int = 5,
    random_state: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Divide as interações em treino e teste por usuário.

    Cada usuário com pelo menos `min_interactions` contribui com uma fração
    `test_size` de seus itens para o teste (embaralhado com semente fixa).
    Usuários com poucos itens vão inteiramente para o treino.

    Retorna (treino, teste).
    """
    rng = np.random.default_rng(random_state)
    train_parts: list[pd.DataFrame] = []
    test_parts: list[pd.DataFrame] = []

    for _, group in recommendations.groupby("user_id"):
        n = len(group)
        if n < min_interactions:
            train_parts.append(group)
            continue

        n_test = max(1, int(round(n * test_size)))
        idx = rng.permutation(n)
        test_idx = idx[:n_test]
        train_idx = idx[n_test:]

        test_parts.append(group.iloc[test_idx])
        train_parts.append(group.iloc[train_idx])

    train = pd.concat(train_parts, ignore_index=True) if train_parts else recommendations.iloc[0:0]
    test = pd.concat(test_parts, ignore_index=True) if test_parts else recommendations.iloc[0:0]
    return train, test


def precision_at_n(recommended: Iterable[int], relevant: set[int], n: int) -> float:
    """Proporção dos top-N recomendados que são relevantes."""
    if n == 0:
        return 0.0
    top = list(recommended)[:n]
    return len([i for i in top if i in relevant]) / n


def recall_at_n(recommended: Iterable[int], relevant: set[int], n: int) -> float:
    """Proporção dos itens relevantes coberta pelos top-N recomendados."""
    if not relevant:
        return 0.0
    top = set(list(recommended)[:n])
    return len(top & relevant) / len(relevant)


def ndcg_at_n(recommended: Iterable[int], relevant: set[int], n: int) -> float:
    """nDCG@N com ganho binário (1 se relevante, 0 caso contrário)."""
    top = list(recommended)[:n]
    dcg = 0.0
    for i, item in enumerate(top):
        if item in relevant:
            dcg += 1.0 / np.log2(i + 2)

    ideal_n = min(len(relevant), n)
    idcg = sum(1.0 / np.log2(i + 2) for i in range(ideal_n))
    if idcg == 0:
        return 0.0
    return dcg / idcg


def evaluate_recommender(
    recommender: ContentBasedRecommender,
    train: pd.DataFrame,
    test: pd.DataFrame,
    users: Iterable[int],
    top_n: int = 10,
) -> dict[str, float]:
    """Avalia um recomendador sobre um conjunto de usuários.

    Para cada usuário com itens no teste, gera recomendações no treino e
    compara com os itens relevantes (teste). Retorna médias de Precision@N,
    Recall@N e nDCG@N.
    """
    precisions: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []

    for user_id in users:
        relevant = set(
            test[test["user_id"] == user_id]["app_id"].astype(int).tolist()
        )
        if not relevant:
            continue

        recommended = recommender.recommend(user_id, train, top_n=top_n)
        precisions.append(precision_at_n(recommended, relevant, top_n))
        recalls.append(recall_at_n(recommended, relevant, top_n))
        ndcgs.append(ndcg_at_n(recommended, relevant, top_n))

    if not precisions:
        return {"precision": 0.0, "recall": 0.0, "ndcg": 0.0}

    return {
        "precision": float(np.mean(precisions)),
        "recall": float(np.mean(recalls)),
        "ndcg": float(np.mean(ndcgs)),
    }


def popularity_baseline(
    train: pd.DataFrame,
    test: pd.DataFrame,
    users: Iterable[int],
    top_n: int = 10,
) -> dict[str, float]:
    """Baseline de itens mais populares (por contagem de interações no treino)."""
    counts = train["app_id"].value_counts()
    popular = counts.index.astype(int).tolist()

    precisions: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []

    for user_id in users:
        relevant = set(
            test[test["user_id"] == user_id]["app_id"].astype(int).tolist()
        )
        if not relevant:
            continue

        precisions.append(precision_at_n(popular, relevant, top_n))
        recalls.append(recall_at_n(popular, relevant, top_n))
        ndcgs.append(ndcg_at_n(popular, relevant, top_n))

    if not precisions:
        return {"precision": 0.0, "recall": 0.0, "ndcg": 0.0}

    return {
        "precision": float(np.mean(precisions)),
        "recall": float(np.mean(recalls)),
        "ndcg": float(np.mean(ndcgs)),
    }


def random_baseline(
    app_ids: Iterable[int],
    test: pd.DataFrame,
    users: Iterable[int],
    top_n: int = 10,
    random_state: int = 42,
) -> dict[str, float]:
    """Baseline de recomendação aleatória sobre o catálogo."""
    catalog = list(app_ids)
    rng = np.random.default_rng(random_state)

    precisions: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []

    for user_id in users:
        relevant = set(
            test[test["user_id"] == user_id]["app_id"].astype(int).tolist()
        )
        if not relevant:
            continue

        recommended = rng.choice(catalog, size=min(top_n, len(catalog)), replace=False).tolist()
        precisions.append(precision_at_n(recommended, relevant, top_n))
        recalls.append(recall_at_n(recommended, relevant, top_n))
        ndcgs.append(ndcg_at_n(recommended, relevant, top_n))

    if not precisions:
        return {"precision": 0.0, "recall": 0.0, "ndcg": 0.0}

    return {
        "precision": float(np.mean(precisions)),
        "recall": float(np.mean(recalls)),
        "ndcg": float(np.mean(ndcgs)),
    }


def coverage(
    recommendations_by_user: dict[int, list[int]],
    catalog_size: int,
) -> float:
    """Fração do catálogo que foi recomendada a pelo menos um usuário.

    Métrica de cobertura/diversidade do sistema.
    """
    if catalog_size == 0:
        return 0.0
    recommended_items = set()
    for recs in recommendations_by_user.values():
        recommended_items.update(recs)
    return len(recommended_items) / catalog_size

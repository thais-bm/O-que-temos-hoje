
"""Avaliação do sistema de recomendação.

Implementa:
- Split treino/teste temporal por usuário, com fallback aleatório.
- Métricas: Precision@N, Recall@N e nDCG@N.
- Baselines: recomendação aleatória e itens mais populares.
- Exclusão dos itens consumidos nos baselines.
- Métrica de cobertura do catálogo.
"""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd

from ..models.recommender import ContentBasedRecommender


def _positive_interactions(data: pd.DataFrame) -> pd.DataFrame:
    """Retorna somente interações positivas.

    Mantém compatibilidade com DataFrames antigos sem is_recommended,
    considerando suas interações como positivas.
    """
    if "is_recommended" not in data.columns:
        return data

    values = data["is_recommended"]

    if values.dtype == bool:
        return data[values.fillna(False)]

    normalized = values.astype(str).str.strip().str.lower()

    positive = normalized.isin({"true", "1", "yes", "sim"})
    return data[positive]


def _relevant_items(
    test: pd.DataFrame,
    user_id: int,
) -> set[int]:
    """Obtém os jogos relevantes de um usuário no conjunto de teste."""
    user_test = test[test["user_id"] == user_id]
    user_test = _positive_interactions(user_test)

    return set(
        user_test["app_id"].dropna().astype(int).tolist()
    )


def _consumed_items(
    train: pd.DataFrame,
    user_id: int,
) -> set[int]:
    """Obtém todos os jogos presentes no histórico de treino."""
    user_train = train[train["user_id"] == user_id]

    return set(
        user_train["app_id"].dropna().astype(int).tolist()
    )


def _validate_top_n(top_n: int) -> None:
    if not isinstance(top_n, int) or top_n < 1:
        raise ValueError("top_n deve ser um inteiro maior ou igual a 1.")


def train_test_split(
    recommendations: pd.DataFrame,
    test_size: float = 0.2,
    min_interactions: int = 5,
    random_state: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Divide as interações em treino e teste por usuário.

    Quando existe a coluna date, utiliza divisão temporal:
    - interações antigas vão para treino;
    - interações recentes vão para teste.

    Se date não existir ou não possuir datas válidas para um usuário,
    utiliza divisão aleatória com semente fixa.

    Usuários com menos de min_interactions permanecem inteiramente
    no conjunto de treino.
    """
    if not 0 < test_size < 1:
        raise ValueError("test_size deve estar entre 0 e 1.")

    if min_interactions < 2:
        raise ValueError("min_interactions deve ser maior ou igual a 2.")

    if "user_id" not in recommendations.columns:
        raise ValueError("O DataFrame precisa conter a coluna user_id.")

    rng = np.random.default_rng(random_state)

    train_parts: list[pd.DataFrame] = []
    test_parts: list[pd.DataFrame] = []

    has_date = "date" in recommendations.columns

    for _, group in recommendations.groupby("user_id", sort=False):
        n = len(group)

        if n < min_interactions:
            train_parts.append(group)
            continue

        n_test = max(1, int(round(n * test_size)))
        n_test = min(n_test, n - 1)

        if has_date:
            dates = pd.to_datetime(
                group["date"],
                errors="coerce",
                utc=True,
            )

            if dates.notna().any():
                # Datas ausentes ficam antes das datas válidas.
                ordered = group.assign(
                    _evaluation_date=dates
                ).sort_values(
                    "_evaluation_date",
                    ascending=True,
                    na_position="first",
                    kind="stable",
                )

                test_parts.append(
                    ordered.iloc[-n_test:].drop(
                        columns="_evaluation_date"
                    )
                )

                train_parts.append(
                    ordered.iloc[:-n_test].drop(
                        columns="_evaluation_date"
                    )
                )

                continue

        # Fallback aleatório para dados sem datas válidas.
        indices = rng.permutation(n)
        test_indices = indices[:n_test]
        train_indices = indices[n_test:]

        test_parts.append(group.iloc[test_indices])
        train_parts.append(group.iloc[train_indices])

    train = (
        pd.concat(train_parts, ignore_index=True)
        if train_parts
        else recommendations.iloc[0:0].copy()
    )

    test = (
        pd.concat(test_parts, ignore_index=True)
        if test_parts
        else recommendations.iloc[0:0].copy()
    )

    return train, test


def precision_at_n(
    recommended: Iterable[int],
    relevant: set[int],
    n: int,
) -> float:
    """Proporção dos top-N recomendados que são relevantes."""
    if n <= 0:
        return 0.0

    top = list(recommended)[:n]

    return len(set(top) & relevant) / n


def recall_at_n(
    recommended: Iterable[int],
    relevant: set[int],
    n: int,
) -> float:
    """Proporção dos itens relevantes coberta pelos top-N."""
    if n <= 0 or not relevant:
        return 0.0

    top = set(list(recommended)[:n])

    return len(top & relevant) / len(relevant)


def ndcg_at_n(
    recommended: Iterable[int],
    relevant: set[int],
    n: int,
) -> float:
    """Calcula nDCG@N com ganho binário."""
    if n <= 0 or not relevant:
        return 0.0

    top = list(recommended)[:n]

    dcg = sum(
        1.0 / np.log2(position + 2)
        for position, item in enumerate(top)
        if item in relevant
    )

    ideal_n = min(len(relevant), n)

    idcg = sum(
        1.0 / np.log2(position + 2)
        for position in range(ideal_n)
    )

    if idcg == 0:
        return 0.0

    return float(dcg / idcg)


def _calculate_metrics(
    recommended: list[int],
    relevant: set[int],
    top_n: int,
) -> tuple[float, float, float]:
    """Calcula as três métricas para um usuário."""
    return (
        precision_at_n(recommended, relevant, top_n),
        recall_at_n(recommended, relevant, top_n),
        ndcg_at_n(recommended, relevant, top_n),
    )


def _mean_metrics(
    precisions: list[float],
    recalls: list[float],
    ndcgs: list[float],
) -> dict[str, float]:
    """Calcula as médias das métricas."""
    if not precisions:
        return {
            "precision": 0.0,
            "recall": 0.0,
            "ndcg": 0.0,
        }

    return {
        "precision": float(np.mean(precisions)),
        "recall": float(np.mean(recalls)),
        "ndcg": float(np.mean(ndcgs)),
    }


def evaluate_recommender(
    recommender: ContentBasedRecommender,
    train: pd.DataFrame,
    test: pd.DataFrame,
    users: Iterable[int],
    top_n: int = 10,
) -> dict[str, float]:
    """Avalia o recomendador usando somente itens positivos no teste."""
    _validate_top_n(top_n)

    precisions: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []

    for user_id in users:
        relevant = _relevant_items(test, user_id)

        if not relevant:
            continue

        recommended = recommender.recommend(
            user_id,
            train,
            top_n=top_n,
            exclude_consumed=True,
        )

        precision, recall, ndcg = _calculate_metrics(
            recommended,
            relevant,
            top_n,
        )

        precisions.append(precision)
        recalls.append(recall)
        ndcgs.append(ndcg)

    return _mean_metrics(precisions, recalls, ndcgs)


def popularity_baseline(
    train: pd.DataFrame,
    test: pd.DataFrame,
    users: Iterable[int],
    top_n: int = 10,
) -> dict[str, float]:
    """Baseline de popularidade com exclusão de itens consumidos.

    A popularidade é calculada pela quantidade de interações positivas
    no conjunto de treino.
    """
    _validate_top_n(top_n)

    positive_train = _positive_interactions(train)

    popular = (
        positive_train["app_id"]
        .value_counts()
        .index.astype(int)
        .tolist()
    )

    precisions: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []

    for user_id in users:
        relevant = _relevant_items(test, user_id)

        if not relevant:
            continue

        consumed = _consumed_items(train, user_id)

        recommended = [
            app_id
            for app_id in popular
            if app_id not in consumed
        ][:top_n]

        precision, recall, ndcg = _calculate_metrics(
            recommended,
            relevant,
            top_n,
        )

        precisions.append(precision)
        recalls.append(recall)
        ndcgs.append(ndcg)

    return _mean_metrics(precisions, recalls, ndcgs)


def random_baseline(
    app_ids: Iterable[int],
    test: pd.DataFrame,
    users: Iterable[int],
    top_n: int = 10,
    random_state: int = 42,
    train: pd.DataFrame | None = None,
) -> dict[str, float]:
    """Baseline aleatório que exclui os itens consumidos no treino.

    O parâmetro train é opcional para preservar compatibilidade com
    chamadas antigas. Para uma avaliação justa, deve ser informado.
    """
    _validate_top_n(top_n)

    catalog = list(dict.fromkeys(int(aid) for aid in app_ids))
    rng = np.random.default_rng(random_state)

    precisions: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []

    for user_id in users:
        relevant = _relevant_items(test, user_id)

        if not relevant:
            continue

        consumed = (
            _consumed_items(train, user_id)
            if train is not None
            else set()
        )

        available = [
            app_id
            for app_id in catalog
            if app_id not in consumed
        ]

        sample_size = min(top_n, len(available))

        if sample_size == 0:
            recommended = []
        else:
            recommended = rng.choice(
                available,
                size=sample_size,
                replace=False,
            ).tolist()

        precision, recall, ndcg = _calculate_metrics(
            recommended,
            relevant,
            top_n,
        )

        precisions.append(precision)
        recalls.append(recall)
        ndcgs.append(ndcg)

    return _mean_metrics(precisions, recalls, ndcgs)


def coverage(
    recommendations_by_user: dict[int, list[int]],
    catalog_size: int,
) -> float:
    """Fração do catálogo recomendado a pelo menos um usuário."""
    if catalog_size <= 0:
        return 0.0

    recommended_items: set[int] = set()

    for recs in recommendations_by_user.values():
        recommended_items.update(recs)

    return len(recommended_items) / catalog_size

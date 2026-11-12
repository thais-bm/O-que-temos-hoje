"""Testes para o módulo de avaliação (src/evaluation)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.evaluation.evaluator import (
    train_test_split,
    precision_at_n,
    recall_at_n,
    ndcg_at_n,
    evaluate_recommender,
    popularity_baseline,
    random_baseline,
    coverage,
)


def test_precision_at_n():
    assert precision_at_n([1, 2, 3], {1, 3}, 3) == 2 / 3
    assert precision_at_n([1, 2, 3], set(), 3) == 0.0
    assert precision_at_n([], {1}, 3) == 0.0
    assert precision_at_n([1, 2, 3], {1, 2, 3}, 3) == 1.0


def test_recall_at_n():
    assert recall_at_n([1, 2, 3], {1, 3}, 3) == 1.0
    assert recall_at_n([1, 2, 3], {1, 3, 5}, 3) == 2 / 3
    assert recall_at_n([1, 2, 3], set(), 3) == 0.0


def test_ndcg_at_n():
    assert ndcg_at_n([1, 2, 3], {1, 3}, 3) == 1.0  # ordem ideal
    v = ndcg_at_n([2, 3, 1], {1, 3}, 3)
    assert 0.0 < v < 1.0
    assert ndcg_at_n([1, 2, 3], set(), 3) == 0.0


def test_train_test_split_min_interactions():
    recs = pd.DataFrame(
        {
            "user_id": [1] * 4 + [2] * 2,
            "app_id": [10, 20, 30, 40, 50, 60],
            "hours": [1.0] * 6,
        }
    )
    train, test = train_test_split(recs, test_size=0.25, min_interactions=3, random_state=42)
    # Usuário 1 tem 4 interações (>=3) -> entra no split
    # Usuário 2 tem 2 interações (<3) -> vai todo para treino
    assert len(train) > 0
    assert set(train[train["user_id"] == 2]["app_id"]) == {50, 60}


def test_evaluate_recommender_synthetic():
    from scipy.sparse import csr_matrix

    item_matrix = csr_matrix(
        np.array(
            [
                [1, 0, 1, 0],
                [1, 1, 0, 0],
                [0, 1, 1, 0],
                [0, 0, 1, 1],
                [1, 0, 0, 1],
                [0, 1, 0, 1],
            ],
            dtype=float,
        )
    )
    app_ids = [101, 102, 103, 104, 105, 106]
    from src.models.recommender import ContentBasedRecommender

    rec = ContentBasedRecommender(item_matrix, app_ids, ["f1", "f2", "f3", "f4"])

    train = pd.DataFrame(
        {
            "user_id": [1, 1, 1, 2, 2, 2],
            "app_id": [101, 102, 103, 104, 105, 106],
            "hours": [2.0, 1.0, 0.5, 3.0, 1.0, 2.0],
        }
    )
    test = pd.DataFrame(
        {
            "user_id": [1, 2],
            "app_id": [104, 101],
            "hours": [1.0, 1.0],
        }
    )

    res = evaluate_recommender(rec, train, test, [1, 2], top_n=3)
    assert "precision" in res
    assert "recall" in res
    assert "ndcg" in res
    assert 0.0 <= res["precision"] <= 1.0
    assert 0.0 <= res["recall"] <= 1.0
    assert 0.0 <= res["ndcg"] <= 1.0


def test_baselines_synthetic():
    train = pd.DataFrame(
        {
            "user_id": [1, 1, 2, 2],
            "app_id": [101, 102, 101, 103],
            "hours": [1.0, 1.0, 1.0, 1.0],
        }
    )
    test = pd.DataFrame(
        {"user_id": [1, 2], "app_id": [102, 101], "hours": [1.0, 1.0]}
    )
    app_ids = [101, 102, 103]

    pop = popularity_baseline(train, test, [1, 2], top_n=2)
    assert 0.0 <= pop["precision"] <= 1.0

    rand = random_baseline(app_ids, test, [1, 2], top_n=2, random_state=42)
    assert 0.0 <= rand["precision"] <= 1.0


def test_coverage():
    recs_by_user = {1: [101, 102], 2: [102, 103], 3: [104]}
    assert coverage(recs_by_user, 4) == 3 / 4
    assert coverage(recs_by_user, 10) == 0.4
    assert coverage({}, 5) == 0.0

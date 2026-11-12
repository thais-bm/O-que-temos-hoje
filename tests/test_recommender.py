"""Testes para o recomendador baseado em conteúdo (src/models)."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix

from src.models.recommender import ContentBasedRecommender


def _make_recommender():
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
    return ContentBasedRecommender(item_matrix, [101, 102, 103, 104, 105, 106], ["f1", "f2", "f3", "f4"])


def test_recommend_top_n():
    rec = _make_recommender()
    hist = pd.DataFrame(
        {
            "user_id": [1, 1, 1],
            "app_id": [101, 102, 103],
            "hours": [2.0, 1.0, 0.5],
        }
    )
    recommended = rec.recommend(1, hist, top_n=3)
    assert len(recommended) <= 3
    # Itens consumidos não devem ser recomendados
    assert not set(recommended) & {101, 102, 103}
    assert all(aid in [101, 102, 103, 104, 105, 106] for aid in recommended)


def test_recommend_exclude_consumed_false():
    rec = _make_recommender()
    hist = pd.DataFrame(
        {
            "user_id": [1, 1],
            "app_id": [101, 102],
            "hours": [2.0, 1.0],
        }
    )
    recommended = rec.recommend(1, hist, top_n=6, exclude_consumed=False)
    assert len(recommended) == 6


def test_recommend_no_history():
    rec = _make_recommender()
    hist = pd.DataFrame(
        {
            "user_id": [2],
            "app_id": [104],
            "hours": [3.0],
        }
    )
    # Usuário 1 não tem histórico
    assert rec.recommend(1, hist, top_n=3) == []


def test_recommend_unknown_user():
    rec = _make_recommender()
    hist = pd.DataFrame(
        {
            "user_id": [1],
            "app_id": [101],
            "hours": [1.0],
        }
    )
    assert rec.recommend(999, hist, top_n=3) == []


def test_deterministic():
    rec = _make_recommender()
    hist = pd.DataFrame(
        {
            "user_id": [1, 1],
            "app_id": [101, 102],
            "hours": [2.0, 1.0],
        }
    )
    r1 = rec.recommend(1, hist, top_n=3)
    r2 = rec.recommend(1, hist, top_n=3)
    assert r1 == r2

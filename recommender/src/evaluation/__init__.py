"""Módulo de avaliação do sistema de recomendação."""

from .evaluator import (
    train_test_split,
    precision_at_n,
    recall_at_n,
    ndcg_at_n,
    evaluate_recommender,
    popularity_baseline,
    random_baseline,
    coverage,
)

__all__ = [
    "train_test_split",
    "precision_at_n",
    "recall_at_n",
    "ndcg_at_n",
    "evaluate_recommender",
    "popularity_baseline",
    "random_baseline",
    "coverage",
]

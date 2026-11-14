"""Pipeline de engenharia de dados: orquestra carga e construção de vetores."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .loader import (
    load_games,
    load_metadata,
    load_recommendations,
    load_users,
    RAW_DIR,
)
from .preprocess import build_item_vectors


def prepare_data(
    raw_dir: str | Path | None = None,
) -> dict:
    """Prepara todos os dados necessários para o modelo de recomendação.

    Retorna um dicionário com:
      games, metadata, users, recommendations, item_matrix, app_ids, features
    """
    base = Path(raw_dir) if raw_dir else RAW_DIR

    games = load_games(base / "games.csv")
    metadata = load_metadata(base / "games_metadata.json")
    users = load_users(base / "users.csv")
    recommendations = load_recommendations(base / "recommendations.csv")

    item_matrix, app_ids, features = build_item_vectors(games, metadata)

    return {
        "games": games,
        "metadata": metadata,
        "users": users,
        "recommendations": recommendations,
        "item_matrix": item_matrix,
        "app_ids": app_ids,
        "features": features,
    }

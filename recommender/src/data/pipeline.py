
"""Pipeline de preparação dos dados armazenados no SQLite."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .loader import (
    DB_PATH,
    load_games,
    load_metadata,
    load_recommendations,
    load_users,
)
from .preprocess import build_item_vectors


def prepare_data(
    user_id: int | None = None,
    db_path: str | Path | None = None,
) -> dict:
    """
    Prepara os dados necessários para o recomendador.

    O catálogo e os metadados são carregados do SQLite.

    Se user_id for informado, carrega somente as informações e
    interações daquele usuário.

    Não carrega a tabela completa de recomendações, pois ela possui
    dezenas de milhões de registros.
    """

    database = Path(db_path) if db_path else DB_PATH

    games = load_games(database)
    metadata = load_metadata(database)

    if user_id is not None:
        users = load_users(user_id, database)
        recommendations = load_recommendations(user_id, database)
    else:
        users = pd.DataFrame(
            columns=["user_id", "products", "reviews"]
        )

        recommendations = pd.DataFrame(
            columns=[
                "user_id",
                "app_id",
                "hours",
                "is_recommended",
            ]
        )

    item_matrix, app_ids, features = build_item_vectors(
        games,
        metadata,
    )

    return {
        "games": games,
        "metadata": metadata,
        "users": users,
        "recommendations": recommendations,
        "item_matrix": item_matrix,
        "app_ids": app_ids,
        "features": features,
    }

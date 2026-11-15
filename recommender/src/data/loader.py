
"""Acesso aos dados do dataset Steam armazenados no SQLite."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DB_PATH = PROJECT_ROOT / "data" / "steam.db"


@contextmanager
def get_connection(
    db_path: str | Path | None = None,
) -> Iterator[sqlite3.Connection]:
    """Abre e fecha corretamente uma conexão com o banco SQLite."""

    path = Path(db_path) if db_path else DB_PATH

    if not path.exists():
        raise FileNotFoundError(
            f"Banco SQLite não encontrado: {path}\n"
            "Execute primeiro: python scripts/import_steam_db.py"
        )

    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
    finally:
        connection.close()


def _parse_tags(value: Any) -> list[str]:
    """Converte o JSON de tags em uma lista de strings."""

    if not value:
        return []

    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []

    if not isinstance(parsed, list):
        return []

    return [
        str(tag)
        for tag in parsed
        if tag is not None
    ]


def _catalog_filters(
    search: str | None = None,
    tag: str | None = None,
) -> tuple[str, list[Any]]:
    """Monta os filtros parametrizados utilizados nas consultas do catálogo."""

    conditions = []
    params: list[Any] = []

    if search and search.strip():
        term = f"%{search.strip()}%"

        conditions.append(
            """
            (
                g.title LIKE ?
                OR COALESCE(gm.description, '') LIKE ?
            )
            """
        )

        params.extend([term, term])

    if tag and tag.strip():
        conditions.append(
            """
            EXISTS (
                SELECT 1
                FROM json_each(
                    CASE
                        WHEN json_valid(gm.tags) THEN gm.tags
                        ELSE '[]'
                    END
                ) AS tag_item
                WHERE lower(CAST(tag_item.value AS TEXT)) = lower(?)
            )
            """
        )

        params.append(tag.strip())

    where_clause = (
        f"WHERE {' AND '.join(conditions)}"
        if conditions
        else ""
    )

    return where_clause, params


def load_games(
    db_path: str | Path | None = None,
) -> pd.DataFrame:
    """Carrega o catálogo completo de jogos do SQLite."""

    with get_connection(db_path) as connection:
        games = pd.read_sql_query(
            """
            SELECT
                app_id,
                title,
                date_release,
                win,
                mac,
                linux,
                rating,
                positive_ratio,
                user_reviews,
                price_final,
                price_original,
                discount,
                steam_deck
            FROM games
            ORDER BY app_id
            """,
            connection,
        )

    return games


def load_games_page(
    search: str | None = None,
    tag: str | None = None,
    limit: int = 24,
    offset: int = 0,
    db_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    """Carrega uma página do catálogo com filtros opcionais."""

    if limit < 1:
        raise ValueError("limit deve ser maior que zero.")

    if offset < 0:
        raise ValueError("offset não pode ser negativo.")

    where_clause, params = _catalog_filters(search, tag)

    query = f"""
        SELECT
            g.app_id,
            g.title,
            g.date_release,
            g.win,
            g.mac,
            g.linux,
            g.rating,
            g.positive_ratio,
            g.user_reviews,
            g.price_final,
            g.price_original,
            g.discount,
            g.steam_deck,
            gm.description,
            gm.tags
        FROM games AS g
        LEFT JOIN game_metadata AS gm
            ON gm.app_id = g.app_id
        {where_clause}
        ORDER BY g.app_id
        LIMIT ?
        OFFSET ?
    """

    with get_connection(db_path) as connection:
        rows = connection.execute(
            query,
            [*params, limit, offset],
        ).fetchall()

    records = []

    for row in rows:
        record = dict(row)
        record["tags"] = _parse_tags(record.get("tags"))
        records.append(record)

    return records


def count_games_filtered(
    search: str | None = None,
    tag: str | None = None,
    db_path: str | Path | None = None,
) -> int:
    """Conta os jogos que correspondem aos filtros do catálogo."""

    where_clause, params = _catalog_filters(search, tag)

    query = f"""
        SELECT COUNT(*)
        FROM games AS g
        LEFT JOIN game_metadata AS gm
            ON gm.app_id = g.app_id
        {where_clause}
    """

    with get_connection(db_path) as connection:
        result = connection.execute(
            query,
            params,
        ).fetchone()

    return int(result[0])


def load_catalog_tags(
    db_path: str | Path | None = None,
) -> list[str]:
    """Retorna todas as tags distintas existentes nos metadados."""

    query = """
        SELECT DISTINCT
            CAST(tag_item.value AS TEXT) AS tag
        FROM game_metadata AS gm,
        json_each(
            CASE
                WHEN json_valid(gm.tags) THEN gm.tags
                ELSE '[]'
            END
        ) AS tag_item
        WHERE tag_item.value IS NOT NULL
          AND TRIM(CAST(tag_item.value AS TEXT)) <> ''
        ORDER BY lower(tag)
    """

    with get_connection(db_path) as connection:
        rows = connection.execute(query).fetchall()

    return [str(row["tag"]) for row in rows]


def load_metadata(
    db_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    """Carrega descrições e tags dos jogos do SQLite."""

    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT app_id, description, tags
            FROM game_metadata
            ORDER BY app_id
            """
        ).fetchall()

    records = []

    for row in rows:
        records.append(
            {
                "app_id": row["app_id"],
                "description": row["description"] or "",
                "tags": _parse_tags(row["tags"]),
            }
        )

    return records


def load_users(
    user_id: int,
    db_path: str | Path | None = None,
) -> pd.DataFrame:
    """Carrega os dados agregados de um usuário específico."""

    with get_connection(db_path) as connection:
        users = pd.read_sql_query(
            """
            SELECT user_id, products, reviews
            FROM users
            WHERE user_id = ?
            """,
            connection,
            params=(user_id,),
        )

    return users


def load_users_page(
    after: int | None = None,
    limit: int = 20,
    db_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    """
    Carrega uma página de usuários utilizando keyset pagination.

    Quando after é informado, retorna somente usuários com user_id
    maior que o cursor recebido.
    """

    if limit < 1:
        raise ValueError("limit deve ser maior que zero.")

    if after is not None and after < 0:
        raise ValueError("after não pode ser negativo.")

    query = """
        SELECT user_id, products, reviews
        FROM users
    """

    params: list[Any] = []

    if after is not None:
        query += " WHERE user_id > ?"
        params.append(after)

    query += """
        ORDER BY user_id
        LIMIT ?
    """

    params.append(limit)

    with get_connection(db_path) as connection:
        rows = connection.execute(
            query,
            params,
        ).fetchall()

    return [
        {
            "user_id": int(row["user_id"]),
            "products": int(row["products"]),
            "reviews": int(row["reviews"]),
        }
        for row in rows
    ]


def count_users(
    db_path: str | Path | None = None,
) -> int:
    """Retorna a quantidade total de usuários cadastrados."""

    with get_connection(db_path) as connection:
        result = connection.execute(
            "SELECT COUNT(*) FROM users"
        ).fetchone()

    return int(result[0])


def load_recommendations(
    user_id: int,
    db_path: str | Path | None = None,
) -> pd.DataFrame:
    """Carrega as interações de um usuário, incluindo a data da avaliação."""

    with get_connection(db_path) as connection:
        recommendations = pd.read_sql_query(
            """
            SELECT
                user_id,
                app_id,
                date,
                hours,
                is_recommended
            FROM recommendations
            WHERE user_id = ?
            ORDER BY date, review_id
            """,
            connection,
            params=(user_id,),
        )

    return recommendations


def count_rows(
    table_name: str,
    db_path: str | Path | None = None,
) -> int:
    """Retorna a quantidade de registros de uma tabela permitida."""

    allowed_tables = {
        "games",
        "users",
        "recommendations",
        "game_metadata",
    }

    if table_name not in allowed_tables:
        raise ValueError(f"Tabela não permitida: {table_name}")

    with get_connection(db_path) as connection:
        result = connection.execute(
            f"SELECT COUNT(*) FROM {table_name}"
        ).fetchone()

    return int(result[0])

"""Carregamento dos arquivos brutos do dataset."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List

import pandas as pd


RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"


def load_games(path: str | Path | None = None) -> pd.DataFrame:
    """Carrega o catálogo de jogos (games.csv)."""
    path = Path(path) if path else RAW_DIR / "games.csv"
    return pd.read_csv(path, dtype={"app_id": "int64", "steam_deck": "bool"})


def load_metadata(path: str | Path | None = None) -> List[dict]:
    """Carrega metadados (descrição + tags) do games_metadata.json (JSON Lines)."""
    path = Path(path) if path else RAW_DIR / "games_metadata.json"
    records: List[dict] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def load_users(path: str | Path | None = None) -> pd.DataFrame:
    """Carrega agregação por usuário (users.csv)."""
    path = Path(path) if path else RAW_DIR / "users.csv"
    return pd.read_csv(path, dtype={"user_id": "int64"})


def load_recommendations(path: str | Path | None = None) -> pd.DataFrame:
    """Carrega as interações/revisões individuais (recommendations.csv)."""
    path = Path(path) if path else RAW_DIR / "recommendations.csv"
    return pd.read_csv(
        path,
        dtype={
            "app_id": "int64",
            "is_recommended": "bool",
            "hours": "float64",
            "user_id": "int64",
        },
        parse_dates=["date"],
    )

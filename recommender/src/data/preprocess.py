
"""Limpeza de texto, construção de vetores de itens e perfis de usuário."""

from __future__ import annotations

import json
from typing import Iterable

import nltk
import numpy as np
import pandas as pd

from nltk.corpus import stopwords
from nltk.stem import SnowballStemmer
from nltk.tokenize import word_tokenize

from scipy.sparse import csr_matrix, hstack

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MinMaxScaler, normalize


# ---------------------------------------------------------
# Recursos linguísticos
# ---------------------------------------------------------

try:
    _EN_STOPWORDS = set(stopwords.words("english"))
except LookupError:
    nltk.download("stopwords", quiet=True)
    _EN_STOPWORDS = set(stopwords.words("english"))

try:
    _PT_STOPWORDS = set(stopwords.words("portuguese"))
except LookupError:
    nltk.download("stopwords", quiet=True)
    _PT_STOPWORDS = set(stopwords.words("portuguese"))

_STOPWORDS = _EN_STOPWORDS | _PT_STOPWORDS
_STEMMER = SnowballStemmer("english")


def clean_text(text: str | None) -> str:
    """Limpa um texto: minúsculas, tokenização, stopwords e stemming."""

    if text is None:
        return ""

    if not isinstance(text, str):
        if pd.isna(text):
            return ""
        text = str(text)

    text = text.lower()

    # preserve_line=True evita a dependência dos recursos punkt/punkt_tab.
    tokens = word_tokenize(text, preserve_line=True)

    tokens = [
        token
        for token in tokens
        if token.isalpha() and token not in _STOPWORDS
    ]

    tokens = [_STEMMER.stem(token) for token in tokens]

    return " ".join(tokens)


def _normalize_tags(tags: object) -> list[str]:
    """Normaliza tags recebidas como lista, tupla ou string JSON."""

    if tags is None:
        return []

    if isinstance(tags, (list, tuple, set)):
        values = list(tags)

    elif isinstance(tags, str):
        raw = tags.strip()

        if not raw:
            return []

        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            parsed = None

        if isinstance(parsed, list):
            values = parsed
        elif isinstance(parsed, str):
            values = [parsed]
        elif "|" in raw:
            values = raw.split("|")
        else:
            values = [raw]

    else:
        try:
            if pd.isna(tags):
                return []
        except (TypeError, ValueError):
            pass

        values = [tags]

    normalized = []

    for value in values:
        if value is None:
            continue

        try:
            if pd.isna(value):
                continue
        except (TypeError, ValueError):
            pass

        tag = str(value).strip()

        if tag:
            normalized.append(tag)

    return normalized


def _metadata_to_dataframe(
    records: Iterable[dict],
) -> pd.DataFrame:
    """Converte metadados em DataFrame com descrição e tags normalizadas."""

    rows = []

    for rec in records:
        if not isinstance(rec, dict):
            continue

        app_id = rec.get("app_id")

        if app_id is None:
            continue

        try:
            if pd.isna(app_id):
                continue
        except (TypeError, ValueError):
            continue

        description = rec.get("description") or ""
        tags = _normalize_tags(rec.get("tags"))

        rows.append(
            {
                "app_id": int(app_id),
                "description": clean_text(description),
                "tags": "|".join(tags),
            }
        )

    return pd.DataFrame(
        rows,
        columns=["app_id", "description", "tags"],
    )


# ---------------------------------------------------------
# Construção da matriz de características dos jogos
# ---------------------------------------------------------

def build_item_vectors(
    games: pd.DataFrame,
    metadata_records: Iterable[dict],
) -> tuple[csr_matrix, list[int], list[str]]:
    """Constrói a matriz esparsa de características dos jogos.

    Combina:
      - TF-IDF normalizado sobre a descrição limpa;
      - Multi-hot normalizado das tags;
      - Atributos numéricos com influência reduzida.

    Pesos dos grupos:
      - Descrição: 1.0
      - Tags: 1.0
      - Numéricos: 0.3

    Retorna:
      (matriz esparsa, lista de app_ids, nomes das features).
    """

    if not isinstance(games, pd.DataFrame):
        raise TypeError("games deve ser um pandas.DataFrame.")

    if "app_id" not in games.columns:
        raise ValueError("A coluna app_id não existe em games.")

    if games.empty:
        raise ValueError("O catálogo de jogos está vazio.")

    df_games = games.copy()

    if df_games["app_id"].isna().any():
        raise ValueError("Existem jogos sem app_id.")

    df_games["app_id"] = pd.to_numeric(
        df_games["app_id"],
        errors="raise",
    ).astype(int)

    if df_games["app_id"].duplicated().any():
        raise ValueError("Existem app_ids duplicados no catálogo.")

    meta_df = _metadata_to_dataframe(metadata_records)

    if meta_df["app_id"].duplicated().any():
        raise ValueError("Existem app_ids duplicados nos metadados.")

    df = df_games.merge(
        meta_df,
        on="app_id",
        how="left",
        validate="one_to_one",
    )

    df["description"] = df["description"].fillna("")
    df["tags"] = df["tags"].fillna("")

    # ---------------------------------------------------------
    # 1. Descrição: TF-IDF com normalização L2.
    # ---------------------------------------------------------

    tfidf = TfidfVectorizer(
        max_features=5000,
        ngram_range=(1, 2),
    )

    try:
        desc_matrix = tfidf.fit_transform(df["description"])
        desc_features = [
            f"tfidf::{term}"
            for term in tfidf.get_feature_names_out()
        ]

    except ValueError as exc:
        # Permite continuar quando todas as descrições estão vazias
        # ou não produzem termos válidos para o TF-IDF.
        if "empty vocabulary" not in str(exc).lower():
            raise

        desc_matrix = csr_matrix((len(df), 0))
        desc_features = []

    desc_matrix = normalize(
        desc_matrix,
        norm="l2",
        axis=1,
    )

    desc_weight = 1.0
    desc_matrix = desc_matrix * desc_weight

    # ---------------------------------------------------------
    # 2. Tags: representação multi-hot normalizada.
    # ---------------------------------------------------------

    tag_dummies = df["tags"].str.get_dummies(sep="|")

    tag_matrix = csr_matrix(
        tag_dummies.values.astype(float)
    )

    tag_matrix = normalize(
        tag_matrix,
        norm="l2",
        axis=1,
    )

    tag_features = [
        f"tag::{col}"
        for col in tag_dummies.columns
    ]

    tag_weight = 1.0
    tag_matrix = tag_matrix * tag_weight

    # ---------------------------------------------------------
    # 3. Atributos numéricos.
    # ---------------------------------------------------------

    # positive_ratio e user_reviews não entram no perfil,
    # evitando introduzir viés de popularidade.
    numeric_columns = [
        col
        for col in ["price_final", "discount"]
        if col in df.columns
    ]

    if numeric_columns:
        for col in numeric_columns:
            df[col] = pd.to_numeric(
                df[col],
                errors="coerce",
            )

            df[col] = df[col].replace(
                [np.inf, -np.inf],
                np.nan,
            ).fillna(0.0)

        scaler = MinMaxScaler()

        num_values = scaler.fit_transform(
            df[numeric_columns]
        )

        num_matrix = csr_matrix(num_values)

    else:
        num_matrix = csr_matrix((len(df), 0))

    num_features = [
        f"num::{col}"
        for col in numeric_columns
    ]

    numeric_weight = 0.3
    num_matrix = num_matrix * numeric_weight

    # ---------------------------------------------------------
    # 4. Combinação dos grupos.
    # ---------------------------------------------------------

    item_matrix = hstack(
        [
            desc_matrix,
            tag_matrix,
            num_matrix,
        ],
        format="csr",
    )

    features = (
        desc_features
        + tag_features
        + num_features
    )

    app_ids = df["app_id"].tolist()

    if item_matrix.shape[0] != len(app_ids):
        raise RuntimeError(
            "A quantidade de linhas da matriz não corresponde "
            "à quantidade de jogos."
        )

    if item_matrix.shape[1] != len(features):
        raise RuntimeError(
            "A quantidade de features não corresponde "
            "às colunas da matriz."
        )

    return item_matrix, app_ids, features


# ---------------------------------------------------------
# Conversão e ponderação das interações
# ---------------------------------------------------------

def _to_bool(
    value: object,
    default: bool = True,
) -> bool:
    """Converte valores booleanos vindos do pandas/SQLite."""

    if value is None:
        return default

    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        return default

    if isinstance(value, str):
        normalized = value.strip().lower()

        if normalized in {"true", "1", "yes", "sim"}:
            return True

        if normalized in {"false", "0", "no", "não", "nao"}:
            return False

        return default

    if isinstance(value, (bool, np.bool_)):
        return bool(value)

    if isinstance(value, (int, float, np.integer, np.floating)):
        if value == 1:
            return True

        if value == 0:
            return False

        return default

    return default


def _interaction_weight(hours: object) -> float:
    """Calcula o peso da interação a partir das horas jogadas.

    O peso mínimo é 1.0. O crescimento logarítmico evita que
    quantidades muito altas de horas dominem o perfil.
    """

    try:
        value = float(hours)
    except (TypeError, ValueError):
        value = 0.0

    if not np.isfinite(value) or value < 0:
        value = 0.0

    return float(1.0 + np.log1p(value))


# ---------------------------------------------------------
# Construção do perfil do usuário
# ---------------------------------------------------------

def build_user_profile(
    user_id: int,
    recommendations: pd.DataFrame,
    item_matrix: csr_matrix,
    app_ids: list[int],
    min_interactions: int = 1,
) -> tuple[csr_matrix | None, list[int]]:
    """Constrói um perfil equilibrado com preferências positivas e negativas.

    Fórmula:
        profile = positive_profile - 0.5 * negative_profile

    Cada perfil é uma média ponderada pelo tempo jogado.

    Todos os jogos do histórico são retornados em consumed,
    inclusive aqueles que não existem na matriz de características.

    Se não houver avaliações positivas válidas, retorna (None, consumed).
    """

    required_columns = {"user_id", "app_id"}

    if not isinstance(recommendations, pd.DataFrame):
        raise TypeError(
            "recommendations deve ser um pandas.DataFrame."
        )

    if not required_columns.issubset(recommendations.columns):
        missing = required_columns - set(recommendations.columns)

        raise ValueError(
            f"Colunas ausentes no histórico: {sorted(missing)}"
        )

    if min_interactions < 1:
        raise ValueError(
            "min_interactions deve ser maior ou igual a 1."
        )

    if item_matrix.shape[0] != len(app_ids):
        raise ValueError(
            "A quantidade de linhas da matriz deve corresponder "
            "à quantidade de app_ids."
        )

    app_id_to_idx = {}

    for idx, app_id in enumerate(app_ids):
        normalized_id = int(app_id)

        if normalized_id in app_id_to_idx:
            raise ValueError(
                f"app_id duplicado na matriz: {normalized_id}"
            )

        app_id_to_idx[normalized_id] = idx

    user_hist = recommendations[
        recommendations["user_id"] == user_id
    ]

    if user_hist.empty:
        return None, []

    consumed_set: set[int] = set()

    positive_interactions: list[tuple[int, float]] = []
    negative_interactions: list[tuple[int, float]] = []

    for _, row in user_hist.iterrows():
        try:
            app_id = int(row["app_id"])
        except (TypeError, ValueError, OverflowError):
            continue

        consumed_set.add(app_id)

        # Jogos fora do catálogo continuam sendo considerados consumidos,
        # mas não podem participar da construção do perfil.
        if app_id not in app_id_to_idx:
            continue

        recommended = _to_bool(
            row.get("is_recommended", True),
            default=True,
        )

        magnitude = _interaction_weight(
            row.get("hours", 0.0)
        )

        if recommended:
            positive_interactions.append((app_id, magnitude))
        else:
            negative_interactions.append((app_id, magnitude))

    consumed = sorted(consumed_set)

    total_interactions = (
        len(positive_interactions)
        + len(negative_interactions)
    )

    if total_interactions < min_interactions:
        return None, consumed

    if not positive_interactions:
        return None, consumed

    def weighted_average(
        interactions: list[tuple[int, float]],
    ) -> csr_matrix | None:
        """Calcula a média dos vetores ponderada pelas horas jogadas."""

        if not interactions:
            return None

        indices = [
            app_id_to_idx[app_id]
            for app_id, _ in interactions
        ]

        weights = np.asarray(
            [weight for _, weight in interactions],
            dtype=float,
        )

        denominator = weights.sum()

        if denominator <= 0 or not np.isfinite(denominator):
            return None

        selected_items = item_matrix[indices].astype(float)

        weighted_items = selected_items.multiply(
            weights.reshape(-1, 1)
        )

        profile = weighted_items.sum(axis=0) / denominator

        return csr_matrix(profile)

    positive_profile = weighted_average(
        positive_interactions
    )

    if positive_profile is None:
        return None, consumed

    negative_profile = weighted_average(
        negative_interactions
    )

    negative_weight = 0.5

    if negative_profile is not None:
        profile = (
            positive_profile
            - negative_weight * negative_profile
        )
    else:
        profile = positive_profile

    profile = csr_matrix(profile)
    profile.eliminate_zeros()

    if profile.nnz == 0 or np.linalg.norm(profile.data) == 0:
        return None, consumed

    return profile, consumed

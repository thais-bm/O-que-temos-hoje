"""Limpeza de texto, construção de vetores de itens e perfis de usuário."""

from __future__ import annotations

from typing import Iterable

import nltk
import pandas as pd
from nltk.corpus import stopwords
from nltk.stem import SnowballStemmer
from nltk.tokenize import word_tokenize
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MinMaxScaler
from scipy.sparse import hstack, csr_matrix

try:
    _EN_STOPWORDS = set(stopwords.words("english"))
except LookupError:
    nltk.download("stopwords", quiet=True)
    nltk.download("punkt", quiet=True)
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
        text = str(text)
    text = text.lower()
    tokens = word_tokenize(text)
    tokens = [t for t in tokens if t.isalpha() and t not in _STOPWORDS]
    tokens = [_STEMMER.stem(t) for t in tokens]
    return " ".join(tokens)


def _metadata_to_dataframe(records: Iterable[dict]) -> pd.DataFrame:
    """Converte a lista JSON Lines de metadados em DataFrame com descrição limpa."""
    rows = []
    for rec in records:
        app_id = rec.get("app_id")
        description = rec.get("description") or ""
        tags = rec.get("tags") or []
        rows.append(
            {
                "app_id": app_id,
                "description": clean_text(description),
                "tags": "|".join(tags),
            }
        )
    return pd.DataFrame(rows)


def build_item_vectors(
    games: pd.DataFrame, metadata_records: Iterable[dict]
) -> tuple[csr_matrix, list[int], list[str]]:
    """Constrói a matriz esparsa de características dos itens.

    Combina:
      - TF-IDF sobre a descrição limpa
      - Multi-hot (binário) das tags
      - Atributos numéricos escalonados (preço, ratio positivo, reviews, desconto)

    Retorna (matriz esparsa, lista de app_ids, nomes das colunas/features).
    """
    meta_df = _metadata_to_dataframe(metadata_records)

    df = games.merge(meta_df, on="app_id", how="left")

    # Preenche valores ausentes
    df["description"] = df["description"].fillna("")
    df["tags"] = df["tags"].fillna("")
    for col in ["price_final", "positive_ratio", "user_reviews", "discount"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # TF-IDF da descrição
    tfidf = TfidfVectorizer(max_features=5000, ngram_range=(1, 2))
    desc_matrix = tfidf.fit_transform(df["description"])
    desc_features = [f"tfidf::{t}" for t in tfidf.get_feature_names_out()]

    # Multi-hot de tags
    tag_dummies = df["tags"].str.get_dummies(sep="|")
    tag_matrix = csr_matrix(tag_dummies.values.astype(float))
    tag_features = [f"tag::{c}" for c in tag_dummies.columns]

    # Numéricos escalonados
    num_cols = [c for c in ["price_final", "positive_ratio", "user_reviews", "discount"] if c in df.columns]
    scaler = MinMaxScaler()
    num_matrix = csr_matrix(scaler.fit_transform(df[num_cols]))
    num_features = [f"num::{c}" for c in num_cols]

    # Concatena tudo
    item_matrix = hstack([desc_matrix, tag_matrix, num_matrix]).tocsr()
    features = desc_features + tag_features + num_features

    app_ids = df["app_id"].astype(int).tolist()
    return item_matrix, app_ids, features


def build_user_profile(
    user_id: int,
    recommendations: pd.DataFrame,
    item_matrix: csr_matrix,
    app_ids: list[int],
    min_interactions: int = 1,
) -> tuple[csr_matrix | None, list[int]]:
    """Constrói o perfil do usuário como média ponderada dos itens consumidos.

    O peso de cada item é o `hours` (tempo jogado) quando disponível, senão 1.0.
    Retorna (vetor do perfil, lista de app_ids consumidos) ou (None, []) se não houver histórico.
    """
    user_hist = recommendations[recommendations["user_id"] == user_id]
    if user_hist.empty:
        return None, []

    app_id_to_idx = {aid: i for i, aid in enumerate(app_ids)}
    consumed = []
    weights = []
    for _, row in user_hist.iterrows():
        aid = int(row["app_id"])
        if aid in app_id_to_idx:
            consumed.append(aid)
            weights.append(float(row.get("hours", 1.0) or 1.0))

    if not consumed:
        return None, []

    idx = [app_id_to_idx[aid] for aid in consumed]
    w = pd.Series(weights, index=idx)
    # Média ponderada: soma(vetor * peso) / soma(pesos)
    sub = item_matrix[idx].astype(float)
    weighted = sub.multiply(w.values.reshape(-1, 1))
    profile = weighted.sum(axis=0) / w.sum()
    profile = csr_matrix(profile)

    return profile, consumed

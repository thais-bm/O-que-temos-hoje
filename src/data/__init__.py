"""Módulo de engenharia de dados: carregamento, limpeza e pré-processamento."""

from .loader import load_games, load_metadata, load_users, load_recommendations
from .preprocess import clean_text, build_item_vectors, build_user_profile

__all__ = [
    "load_games",
    "load_metadata",
    "load_users",
    "load_recommendations",
    "clean_text",
    "build_item_vectors",
    "build_user_profile",
]

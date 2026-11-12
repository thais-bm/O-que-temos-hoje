"""Modelo de recomendação por Filtragem Baseada em Conteúdo (FBC).

Constrói perfis de usuário a partir dos itens consumidos e gera recomendações
Top-N por similaridade do cosseno, excluindo itens já consumidos.
"""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity

from ..data.preprocess import build_user_profile


class ContentBasedRecommender:
    """Recomendador baseado em conteúdo usando TF-IDF + similaridade do cosseno.

    O perfil do usuário é a média ponderada dos vetores dos itens consumidos
    (peso = horas jogadas). As recomendações são os itens mais similares ao
    perfil, excluindo os já consumidos.
    """

    def __init__(
        self,
        item_matrix: csr_matrix,
        app_ids: list[int],
        features: list[str],
    ) -> None:
        self.item_matrix = item_matrix
        self.app_ids = list(app_ids)
        self.features = list(features)
        self._app_id_to_idx = {aid: i for i, aid in enumerate(self.app_ids)}

    def recommend(
        self,
        user_id: int,
        recommendations: pd.DataFrame,
        top_n: int = 10,
        exclude_consumed: bool = True,
    ) -> list[int]:
        """Gera as top-N recomendações para um usuário.

        Params
        ------
        user_id : int
            ID do usuário.
        recommendations : pd.DataFrame
            Interações do usuário (deve conter user_id, app_id, hours).
        top_n : int
            Quantidade de recomendações a retornar.
        exclude_consumed : bool
            Se True, remove itens já consumidos pelo usuário.

        Returns
        -------
        list[int]
            Lista de app_ids recomendados, ordenados por similaridade decrescente.
        """
        profile, consumed = build_user_profile(
            user_id, recommendations, self.item_matrix, self.app_ids
        )

        if profile is None:
            return []

        # Similaridade do cosseno entre o perfil do usuário e todos os itens
        sims = cosine_similarity(profile, self.item_matrix).ravel()

        # Remove itens consumidos
        if exclude_consumed:
            for aid in consumed:
                idx = self._app_id_to_idx[aid]
                sims[idx] = -1.0

        # Top-N por similaridade (maiores similaridades primeiro)
        top_idx = np.argsort(-sims)[:top_n]
        top_idx = [i for i in top_idx if sims[i] > -1.0]

        return [int(self.app_ids[i]) for i in top_idx]

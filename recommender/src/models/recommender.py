
"""Modelo de recomendação por Filtragem Baseada em Conteúdo (FBC).

Constrói perfis de usuário a partir de preferências positivas e negativas,
gera recomendações Top-N por similaridade do cosseno e fornece explicações
baseadas nas características dos jogos.

Também oferece recomendações cold-start a partir de jogos e tags
selecionados manualmente, sem criar interações fictícias.
"""

from __future__ import annotations

from numbers import Integral

import numpy as np
import pandas as pd

from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import normalize

from ..data.preprocess import build_user_profile


class ContentBasedRecommender:
    """Recomendador baseado em conteúdo usando similaridade do cosseno."""

    def __init__(
        self,
        item_matrix: csr_matrix,
        app_ids: list[int],
        features: list[str],
    ) -> None:
        if item_matrix.shape[0] != len(app_ids):
            raise ValueError(
                "A quantidade de linhas da matriz deve corresponder "
                "à quantidade de app_ids."
            )

        if item_matrix.shape[1] != len(features):
            raise ValueError(
                "A quantidade de características deve corresponder "
                "às colunas da matriz."
            )

        self.item_matrix = item_matrix.tocsr()
        self._item_matrix_normalized = normalize(
            self.item_matrix.astype(np.float64),
            norm="l2",
            axis=1,
            copy=True,
        )
        self.app_ids = [int(aid) for aid in app_ids]
        self.features = list(features)

        # Jogos sem descrição ficam com vetor só de tags/numéricos. Como o
        # cosseno normaliza pelo vetor inteiro, eles ganhavam vantagem sobre
        # jogos com descrição (cujo bloco TF-IDF divide a norma). Tratamos o
        # texto ausente como um bloco TF-IDF ortogonal ao perfil (similaridade
        # textual zero): o cosseno cai por 1/sqrt(2), o que equaliza os dois.
        tfidf_cols = [
            idx for idx, feature in enumerate(self.features)
            if feature.startswith("tfidf::")
        ]
        if tfidf_cols:
            has_text = (
                self.item_matrix[:, tfidf_cols].getnnz(axis=1) > 0
            )
            self._text_scale = np.where(has_text, 1.0, 1.0 / np.sqrt(2.0))
        else:
            self._text_scale = np.ones(self.item_matrix.shape[0])

        if len(set(self.app_ids)) != len(self.app_ids):
            raise ValueError("Existem app_ids duplicados na matriz.")

        self._app_id_to_idx = {
            aid: idx
            for idx, aid in enumerate(self.app_ids)
        }

        self._feature_groups = {
            "description": np.asarray(
                [
                    idx
                    for idx, feature in enumerate(self.features)
                    if feature.startswith("tfidf::")
                ],
                dtype=int,
            ),
            "tags": np.asarray(
                [
                    idx
                    for idx, feature in enumerate(self.features)
                    if feature.startswith("tag::")
                ],
                dtype=int,
            ),
            "numeric": np.asarray(
                [
                    idx
                    for idx, feature in enumerate(self.features)
                    if feature.startswith("num::")
                ],
                dtype=int,
            ),
        }

        # Índice de tags existentes no vocabulário do modelo.
        # A comparação case-insensitive facilita a entrada do usuário,
        # mas o nome original da feature é preservado na resposta.
        self._tag_to_feature = {}

        for idx in self._feature_groups["tags"]:
            tag = self.features[idx].split("::", 1)[1]
            normalized_tag = tag.strip().casefold()

            if normalized_tag:
                self._tag_to_feature[normalized_tag] = {
                    "index": int(idx),
                    "label": tag,
                }

    @staticmethod
    def _to_bool(
        value: object,
        default: bool = True,
    ) -> bool:
        """Interpreta valores booleanos de diferentes origens."""

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

    @staticmethod
    def _safe_float(value: object, default: float = 0.0) -> float:
        """Converte um valor numérico sem permitir NaN ou infinito."""

        try:
            result = float(value)
        except (TypeError, ValueError, OverflowError):
            return default

        if not np.isfinite(result):
            return default

        return result

    @classmethod
    def _interaction_weight(cls, hours: object) -> float:
        """Mantém a mesma ponderação logarítmica do preprocess.py."""

        value = cls._safe_float(hours)

        if value < 0:
            value = 0.0

        return float(1.0 + np.log1p(value))

    def _get_valid_history(
        self,
        recommendations: pd.DataFrame,
        user_id: int,
    ) -> list[dict]:
        """Extrai as interações válidas do usuário presentes no catálogo."""

        history = recommendations[
            recommendations["user_id"] == user_id
        ]

        result = []

        for row in history.itertuples(index=False):
            try:
                app_id = int(getattr(row, "app_id"))
            except (TypeError, ValueError, OverflowError):
                continue

            if app_id not in self._app_id_to_idx:
                continue

            hours = self._safe_float(
                getattr(row, "hours", 0.0)
            )

            if hours < 0:
                hours = 0.0

            recommended = self._to_bool(
                getattr(row, "is_recommended", True),
                default=True,
            )

            result.append(
                {
                    "app_id": app_id,
                    "hours": hours,
                    "is_recommended": recommended,
                    "weight": self._interaction_weight(hours),
                }
            )

        return result

    def _build_profile_summary(
        self,
        profile: csr_matrix,
        history: list[dict],
    ) -> dict:
        """Gera estatísticas e características predominantes do perfil."""

        profile_array = profile.toarray().ravel()

        positive_history = [
            item for item in history
            if item["is_recommended"]
        ]

        negative_history = [
            item for item in history
            if not item["is_recommended"]
        ]

        positive_weight_sum = sum(
            item["weight"] for item in positive_history
        )

        negative_weight_sum = sum(
            item["weight"] for item in negative_history
        )

        history_with_weight = []

        for item in history:
            denominator = (
                positive_weight_sum
                if item["is_recommended"]
                else negative_weight_sum
            )

            weight_share_pct = (
                item["weight"] / denominator * 100.0
                if denominator > 0
                else 0.0
            )

            history_with_weight.append(
                {
                    **item,
                    "weight_share_pct": float(weight_share_pct),
                }
            )

        def get_top_features(
            group: str,
            limit: int = 10,
        ) -> list[dict]:
            indices = self._feature_groups[group]

            if indices.size == 0:
                return []

            values = profile_array[indices]
            positive_mask = values > 0

            if not np.any(positive_mask):
                return []

            selected_indices = indices[positive_mask]
            selected_values = values[positive_mask]

            order = np.argsort(
                -selected_values,
                kind="stable",
            )[:limit]

            return [
                {
                    "label": self.features[
                        selected_indices[position]
                    ].split("::", 1)[1],
                    "weight": float(selected_values[position]),
                }
                for position in order
            ]

        return {
            "total_hours": round(
                sum(item["hours"] for item in history),
                1,
            ),
            "valid_games": len(
                {item["app_id"] for item in history}
            ),
            "valid_interactions": len(history),
            "positive_interactions": len(positive_history),
            "negative_interactions": len(negative_history),
            "top_tags": get_top_features("tags"),
            "top_terms": get_top_features("description"),
            "history_with_weight": history_with_weight,
        }

    def _prepare_consumed_history(
        self,
        recommendations: pd.DataFrame,
        user_id: int,
    ) -> tuple[list[int], csr_matrix | None]:
        """Prepara os jogos do histórico representados na matriz.

        Prioriza avaliações positivas. Se não houver avaliações positivas
        representadas no catálogo, utiliza o histórico disponível completo.
        """

        if recommendations.empty:
            return [], None

        history = recommendations[
            recommendations["user_id"] == user_id
        ]

        if history.empty:
            return [], None

        all_indices = []
        positive_indices = []

        seen_all = set()
        seen_positive = set()

        has_recommended_column = (
            "is_recommended" in history.columns
        )

        for row in history.itertuples(index=False):
            try:
                app_id = int(getattr(row, "app_id"))
            except (TypeError, ValueError, OverflowError):
                continue

            idx = self._app_id_to_idx.get(app_id)

            if idx is None:
                continue

            if idx not in seen_all:
                seen_all.add(idx)
                all_indices.append(idx)

            if has_recommended_column:
                recommended = self._to_bool(
                    getattr(row, "is_recommended"),
                    default=True,
                )
            else:
                recommended = True

            if recommended and idx not in seen_positive:
                seen_positive.add(idx)
                positive_indices.append(idx)

        history_indices = (
            positive_indices
            if positive_indices
            else all_indices
        )

        if not history_indices:
            return [], None

        history_matrix = self.item_matrix[history_indices]

        return history_indices, history_matrix

    def _get_matched_features(
        self,
        profile: np.ndarray,
        candidate: np.ndarray,
        prefix: str,
        limit: int = 5,
    ) -> list[dict]:
        """Retorna características compartilhadas e suas contribuições."""

        if limit <= 0:
            return []

        group = {
            "tfidf::": "description",
            "tag::": "tags",
            "num::": "numeric",
        }.get(prefix)

        if group is None:
            return []

        indices = self._feature_groups[group]

        if indices.size == 0:
            return []

        profile_values = profile[indices]
        candidate_values = candidate[indices]

        mask = (
            (profile_values > 0)
            & (candidate_values > 0)
        )

        if not np.any(mask):
            return []

        matched_indices = indices[mask]

        contributions = (
            profile[matched_indices]
            * candidate[matched_indices]
        )

        order = np.argsort(
            -contributions,
            kind="stable",
        )[:limit]

        return [
            {
                "label": self.features[
                    matched_indices[position]
                ].split("::", 1)[1],
                "contribution": float(
                    contributions[position]
                ),
                "profile_weight": float(
                    profile[matched_indices[position]]
                ),
            }
            for position in order
        ]

    def _get_feature_breakdown(
        self,
        profile: np.ndarray,
        candidate: np.ndarray,
    ) -> dict[str, float]:
        """Calcula a participação percentual positiva de cada grupo."""

        denominator = (
            np.linalg.norm(profile)
            * np.linalg.norm(candidate)
        )

        if denominator == 0 or not np.isfinite(denominator):
            return {
                "description": 0.0,
                "tags": 0.0,
                "numeric": 0.0,
            }

        raw_contributions = {}

        for group, indices in self._feature_groups.items():
            if indices.size == 0:
                raw_contributions[group] = 0.0
                continue

            contribution = np.dot(
                profile[indices],
                candidate[indices],
            )

            raw_contributions[group] = float(
                contribution / denominator
            )

        # A distribuição visual considera apenas contribuições positivas.
        positive_total = sum(
            max(value, 0.0)
            for value in raw_contributions.values()
        )

        if positive_total <= 0:
            return {
                "description": 0.0,
                "tags": 0.0,
                "numeric": 0.0,
            }

        return {
            group: float(
                max(value, 0.0) / positive_total * 100.0
            )
            for group, value in raw_contributions.items()
        }

    def recommend_from_preferences(
        self,
        app_ids: list[int] | None = None,
        tags: list[str] | None = None,
        top_n: int = 10,
    ) -> dict:
        """Gera recomendações cold-start a partir de jogos e tags.

        O perfil é temporário e não representa interações reais.
        Os vetores dos jogos escolhidos são combinados com as tags
        selecionadas diretamente no espaço de características do modelo.

        Os jogos utilizados como referência são sempre excluídos
        das recomendações.
        """

        if (
            not isinstance(top_n, Integral)
            or isinstance(top_n, bool)
            or top_n < 1
        ):
            raise ValueError(
                "top_n deve ser um inteiro maior ou igual a 1."
            )

        app_ids = app_ids or []
        tags = tags or []

        if not isinstance(app_ids, list):
            raise TypeError("app_ids deve ser uma lista de inteiros.")

        if not isinstance(tags, list):
            raise TypeError("tags deve ser uma lista de textos.")

        if not app_ids and not tags:
            raise ValueError(
                "Informe pelo menos um jogo ou uma tag como preferência."
            )

        # Valida e normaliza os IDs dos jogos.
        reference_app_ids = []

        for app_id in app_ids:
            if (
                not isinstance(app_id, Integral)
                or isinstance(app_id, bool)
            ):
                raise ValueError(
                    f"app_id inválido: {app_id!r}. "
                    "Os IDs devem ser inteiros."
                )

            normalized_id = int(app_id)

            if normalized_id not in self._app_id_to_idx:
                raise ValueError(
                    f"O jogo app_id={normalized_id} "
                    "não existe no catálogo do modelo."
                )

            if normalized_id not in reference_app_ids:
                reference_app_ids.append(normalized_id)

        # Valida e normaliza as tags.
        selected_tags = []
        selected_tag_indices = []
        seen_tags = set()

        for tag in tags:
            if not isinstance(tag, str) or not tag.strip():
                raise ValueError(
                    "Todas as tags devem ser textos não vazios."
                )

            normalized_tag = tag.strip().casefold()

            if normalized_tag in seen_tags:
                continue

            tag_feature = self._tag_to_feature.get(
                normalized_tag
            )

            if tag_feature is None:
                raise ValueError(
                    f"A tag '{tag.strip()}' não existe "
                    "no vocabulário de características do modelo."
                )

            seen_tags.add(normalized_tag)

            selected_tags.append(tag_feature["label"])
            selected_tag_indices.append(
                tag_feature["index"]
            )

        # Constrói o vetor médio dos jogos de referência.
        if reference_app_ids:
            reference_indices = [
                self._app_id_to_idx[app_id]
                for app_id in reference_app_ids
            ]

            reference_matrix = self.item_matrix[
                reference_indices
            ]

            game_profile = csr_matrix(
                reference_matrix.mean(axis=0)
            )
        else:
            game_profile = csr_matrix(
                (1, self.item_matrix.shape[1]),
                dtype=self.item_matrix.dtype,
            )

        # Constrói um vetor esparso com as tags selecionadas.
        if selected_tag_indices:
            tag_profile = csr_matrix(
                (
                    np.ones(
                        len(selected_tag_indices),
                        dtype=np.float64,
                    ),
                    (
                        np.zeros(
                            len(selected_tag_indices),
                            dtype=int,
                        ),
                        np.asarray(
                            selected_tag_indices,
                            dtype=int,
                        ),
                    ),
                ),
                shape=(1, self.item_matrix.shape[1]),
            )
        else:
            tag_profile = csr_matrix(
                (1, self.item_matrix.shape[1]),
                dtype=np.float64,
            )

        # Combina jogos e tags no mesmo espaço vetorial.
        profile = (
            game_profile.astype(np.float64)
            + tag_profile
        ).tocsr()

        profile.sum_duplicates()
        profile.eliminate_zeros()

        profile_norm = float(
            np.sqrt(profile.multiply(profile).sum())
        )

        if profile_norm == 0 or not np.isfinite(profile_norm):
            raise ValueError(
                "Não foi possível construir um perfil válido "
                "com as preferências informadas."
            )

        profile = (
            profile.multiply(1.0 / profile_norm)
            .tocsr()
        )

        profile_array = profile.toarray().ravel()

        # Calcula as características predominantes do perfil.
        def get_top_features(
            group: str,
            limit: int = 10,
        ) -> list[dict]:
            indices = self._feature_groups[group]

            if indices.size == 0:
                return []

            values = profile_array[indices]
            positive_mask = values > 0

            if not np.any(positive_mask):
                return []

            selected_indices = indices[positive_mask]
            selected_values = values[positive_mask]

            order = np.argsort(
                -selected_values,
                kind="stable",
            )[:limit]

            return [
                {
                    "label": self.features[
                        selected_indices[position]
                    ].split("::", 1)[1],
                    "weight": float(
                        selected_values[position]
                    ),
                }
                for position in order
            ]

        profile_summary = {
            "reference_app_ids": reference_app_ids,
            "selected_tags": selected_tags,
            "num_reference_games": len(reference_app_ids),
            "num_selected_tags": len(selected_tags),
            "top_tags": get_top_features("tags"),
            "top_terms": get_top_features("description"),
        }

        # Calcula similaridade entre o perfil e o catálogo.
        similarities = (
            self._item_matrix_normalized.dot(profile.T)
            .toarray()
            .ravel()
        ) * self._text_scale

        similarities = np.nan_to_num(
            similarities,
            nan=-1.0,
            posinf=-1.0,
            neginf=-1.0,
        )

        # Exclui obrigatoriamente os jogos utilizados como referência.
        reference_indices = [
            self._app_id_to_idx[app_id]
            for app_id in reference_app_ids
        ]

        if reference_indices:
            similarities[reference_indices] = -np.inf

        top_n_int = int(top_n)
        ranked_indices = []
        for idx in np.argsort(-similarities, kind="stable"):
            if np.isfinite(similarities[idx]):
                ranked_indices.append(int(idx))
                if len(ranked_indices) >= top_n_int:
                    break

        detailed_results = []

        for idx in ranked_indices:
            candidate = (
                self.item_matrix.getrow(idx)
                .toarray()
                .ravel()
            )

            explanation = {
                "most_similar_consumed": None,
                "matched_tags": self._get_matched_features(
                    profile_array,
                    candidate,
                    "tag::",
                ),
                "matched_terms": self._get_matched_features(
                    profile_array,
                    candidate,
                    "tfidf::",
                ),
                "breakdown": self._get_feature_breakdown(
                    profile_array,
                    candidate,
                ),
            }

            detailed_results.append(
                {
                    "app_id": self.app_ids[idx],
                    "similarity": float(similarities[idx]),
                    "explanation": explanation,
                }
            )

        return {
            "top_n": int(top_n),
            "profile": profile_summary,
            "recommendations": detailed_results,
        }

    def recommend_detailed(
        self,
        user_id: int,
        recommendations: pd.DataFrame,
        top_n: int = 10,
        exclude_consumed: bool = True,
    ) -> list[dict]:
        """Retorna recomendações, explicações e resumo do perfil."""

        if (
            not isinstance(top_n, Integral)
            or isinstance(top_n, bool)
            or top_n < 1
        ):
            raise ValueError(
                "top_n deve ser um inteiro maior ou igual a 1."
            )

        if not isinstance(recommendations, pd.DataFrame):
            raise TypeError(
                "recommendations deve ser um pandas.DataFrame."
            )

        if recommendations.empty:
            return []

        profile, consumed = build_user_profile(
            user_id,
            recommendations,
            self.item_matrix,
            self.app_ids,
            app_id_to_idx=self._app_id_to_idx,
        )

        if profile is None:
            return []

        profile_array = profile.toarray().ravel()

        valid_history = self._get_valid_history(
            recommendations,
            user_id,
        )

        profile_summary = self._build_profile_summary(
            profile,
            valid_history,
        )

        profile_norm = normalize(
            profile.astype(np.float64),
            norm="l2",
            axis=1,
            copy=True,
        )
        similarities = (
            self._item_matrix_normalized.dot(profile_norm.T)
            .toarray()
            .ravel()
        ) * self._text_scale

        similarities = np.nan_to_num(
            similarities,
            nan=-1.0,
            posinf=-1.0,
            neginf=-1.0,
        )

        if exclude_consumed:
            consumed_indices = [
                self._app_id_to_idx[app_id]
                for app_id in consumed
                if app_id in self._app_id_to_idx
            ]

            similarities[consumed_indices] = -np.inf

        top_n_int = int(top_n)
        ranked_indices = []
        for idx in np.argsort(-similarities, kind="stable"):
            if np.isfinite(similarities[idx]):
                ranked_indices.append(int(idx))
                if len(ranked_indices) >= top_n_int:
                    break

        if not ranked_indices:
            return []

        history_indices, history_matrix = (
            self._prepare_consumed_history(
                recommendations,
                user_id,
            )
        )

        if history_matrix is not None:
            candidate_history_similarities = cosine_similarity(
                self.item_matrix[ranked_indices],
                history_matrix,
            )

            candidate_history_similarities = np.nan_to_num(
                candidate_history_similarities,
                nan=-1.0,
                posinf=-1.0,
                neginf=-1.0,
            )
        else:
            candidate_history_similarities = None

        # Recupera os dados de interação associados a cada app_id.
        history_by_app_id = {}

        for item in valid_history:
            history_by_app_id.setdefault(
                item["app_id"],
                item,
            )

        detailed_results = []

        for position, idx in enumerate(ranked_indices):
            candidate = (
                self.item_matrix.getrow(idx)
                .toarray()
                .ravel()
            )

            most_similar_consumed = None

            if candidate_history_similarities is not None:
                row_similarities = (
                    candidate_history_similarities[position]
                )

                best_position = int(
                    np.argmax(row_similarities)
                )

                best_idx = history_indices[best_position]
                best_app_id = self.app_ids[best_idx]

                consumed_data = history_by_app_id.get(
                    best_app_id,
                    {},
                )

                most_similar_consumed = {
                    "app_id": best_app_id,
                    "similarity": float(
                        row_similarities[best_position]
                    ),
                    "hours": consumed_data.get("hours", 0.0),
                    "is_recommended": consumed_data.get(
                        "is_recommended",
                        True,
                    ),
                }

            explanation = {
                "most_similar_consumed": most_similar_consumed,
                "matched_tags": self._get_matched_features(
                    profile_array,
                    candidate,
                    "tag::",
                ),
                "matched_terms": self._get_matched_features(
                    profile_array,
                    candidate,
                    "tfidf::",
                ),
                "breakdown": self._get_feature_breakdown(
                    profile_array,
                    candidate,
                ),
            }

            detailed_results.append(
                {
                    "app_id": self.app_ids[idx],
                    "similarity": float(similarities[idx]),
                    "explanation": explanation,
                    "profile": profile_summary,
                }
            )

        return detailed_results

    def recommend(
        self,
        user_id: int,
        recommendations: pd.DataFrame,
        top_n: int = 10,
        exclude_consumed: bool = True,
    ) -> list[int]:
        """Retorna somente os app_ids, preservando a interface anterior."""

        detailed_results = self.recommend_detailed(
            user_id=user_id,
            recommendations=recommendations,
            top_n=top_n,
            exclude_consumed=exclude_consumed,
        )

        return [
            item["app_id"]
            for item in detailed_results
        ]


from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from ..data.loader import (
    DB_PATH,
    count_games_filtered,
    count_rows,
    count_users,
    load_catalog_tags,
    load_games,
    load_games_page,
    load_metadata,
    load_recommendations,
    load_users,
    load_users_page,
)
from ..data.preprocess import build_item_vectors
from ..models.recommender import ContentBasedRecommender
from .schemas import (
    ColdStartProfileSummary,
    ColdStartRequest,
    ColdStartResponse,
    FeatureContribution,
    GameRecommendation,
    HealthResponse,
    HistoryInteraction,
    ProfileFeature,
    RecommendationExplanation,
    RecommendationResponse,
    SimilarGameResponse,
    UserProfileSummary,
)


logger = logging.getLogger(__name__)

# Estado global: catálogo, metadados e modelo são carregados uma única vez.
STATE: dict[str, Any] = {}


def _clean_value(value: Any) -> Any:
    """Converte valores do Pandas e NumPy para tipos compatíveis com JSON."""

    if value is None:
        return None

    if isinstance(value, (list, dict)):
        return value

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if hasattr(value, "item"):
        value = value.item()

    return value


def _parse_tags(value: Any) -> list[str]:
    """Converte as tags armazenadas no SQLite em uma lista de strings."""

    value = _clean_value(value)

    if value is None:
        return []

    if isinstance(value, (list, tuple)):
        return [str(tag) for tag in value if tag is not None]

    if isinstance(value, str):
        try:
            parsed = json.loads(value)

            if isinstance(parsed, list):
                return [str(tag) for tag in parsed if tag is not None]

            if isinstance(parsed, str):
                return [parsed] if parsed.strip() else []

        except json.JSONDecodeError:
            return [
                tag.strip()
                for tag in value.split(",")
                if tag.strip()
            ]

    return []


def _serialize_catalog_game(row: dict[str, Any]) -> dict[str, Any]:
    """Normaliza um registro do catálogo para a resposta da API."""

    app_id = int(row["app_id"])

    title = _clean_value(row.get("title"))
    date_release = _clean_value(row.get("date_release"))

    return {
        "app_id": app_id,
        "title": str(title) if title else f"Jogo {app_id}",
        "rating": _clean_value(row.get("rating")),
        "positive_ratio": _clean_value(row.get("positive_ratio")),
        "user_reviews": _clean_value(row.get("user_reviews")),
        "date_release": (
            str(date_release)
            if date_release is not None
            else None
        ),
        "price_final": _clean_value(row.get("price_final")),
        "price_original": _clean_value(row.get("price_original")),
        "discount": _clean_value(row.get("discount")),
        "description": _clean_value(row.get("description")),
        "tags": _parse_tags(row.get("tags")),
    }


def _build_game_lookup(
    games: pd.DataFrame,
    metadata: list | pd.DataFrame,
) -> dict[int, dict[str, Any]]:
    """Combina os dados dos jogos e metadados em um catálogo em memória."""

    if isinstance(metadata, pd.DataFrame):
        metadata_records = metadata.to_dict(orient="records")
    else:
        metadata_records = metadata or []

    metadata_by_id: dict[int, dict[str, Any]] = {}

    for row in metadata_records:
        if not isinstance(row, dict):
            continue

        app_id = row.get("app_id")

        if app_id is not None:
            metadata_by_id[int(app_id)] = row

    if isinstance(games, pd.DataFrame):
        game_records = games.to_dict(orient="records")
    else:
        game_records = games or []

    game_lookup: dict[int, dict[str, Any]] = {}

    for row in game_records:
        if not isinstance(row, dict):
            continue

        app_id = row.get("app_id")

        if app_id is None:
            continue

        app_id = int(app_id)
        metadata_row = metadata_by_id.get(app_id, {})

        title = _clean_value(row.get("title"))
        date_release = _clean_value(row.get("date_release"))

        game_lookup[app_id] = {
            "app_id": app_id,
            "title": str(title) if title else f"Jogo {app_id}",
            "rating": _clean_value(row.get("rating")),
            "positive_ratio": _clean_value(row.get("positive_ratio")),
            "user_reviews": _clean_value(row.get("user_reviews")),
            "date_release": (
                str(date_release)
                if date_release is not None
                else None
            ),
            "price_final": _clean_value(row.get("price_final")),
            "price_original": _clean_value(row.get("price_original")),
            "discount": _clean_value(row.get("discount")),
            "description": _clean_value(
                metadata_row.get("description")
            ),
            "tags": _parse_tags(metadata_row.get("tags")),
        }

    return game_lookup


def load_data_for_api(
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    """Carrega catálogo, metadados e constrói a matriz de conteúdo."""

    if not db_path.exists():
        raise FileNotFoundError(
            f"Banco de dados não encontrado: {db_path}. "
            "Verifique a importação do banco Steam."
        )

    logger.info("Carregando jogos do SQLite...")
    games = load_games(db_path)

    logger.info("Carregando metadados do SQLite...")
    metadata = load_metadata(db_path)

    if games.empty:
        raise RuntimeError("O catálogo de jogos está vazio.")

    logger.info("Construindo catálogo completo em memória...")
    game_lookup = _build_game_lookup(games, metadata)

    if not game_lookup:
        raise RuntimeError("Não foi possível construir o catálogo.")

    # Índice em memória para consultas rápidas de catálogo (/games) e tags (/tags)
    catalog_entries: list[dict[str, Any]] = []
    catalog_by_tag: dict[str, list[dict[str, Any]]] = {}
    unique_tags_by_lower: dict[str, str] = {}

    for app_id in sorted(game_lookup.keys()):
        serialized = game_lookup[app_id]
        title_lower = (serialized.get("title") or "").lower()
        desc_lower = (serialized.get("description") or "").lower()
        tags_list = serialized.get("tags") or []
        tags_lower = frozenset(t.lower() for t in tags_list if t and t.strip())

        entry = {
            "serialized": serialized,
            "search_blob": f"{title_lower}\n{desc_lower}",
            "tags_lower": tags_lower,
        }
        catalog_entries.append(entry)

        for tag_str in tags_list:
            cleaned_tag = tag_str.strip()
            if not cleaned_tag:
                continue
            tag_key = cleaned_tag.lower()
            if tag_key not in unique_tags_by_lower:
                unique_tags_by_lower[tag_key] = tag_str
            catalog_by_tag.setdefault(tag_key, []).append(entry)

    catalog_tags = [
        unique_tags_by_lower[k]
        for k in sorted(unique_tags_by_lower.keys())
    ]

    logger.info("Construindo matriz TF-IDF + Tags...")
    item_matrix, app_ids, features = build_item_vectors(
        games,
        metadata,
    )

    recommender = ContentBasedRecommender(
        item_matrix=item_matrix,
        app_ids=app_ids,
        features=features,
    )

    logger.info("Consultando quantidade de interações...")
    num_interactions = count_rows(
        "recommendations",
        db_path,
    )

    logger.info("Consultando quantidade de usuários...")
    num_users = count_users(db_path)

    logger.info(
        "Usuários disponíveis no SQLite: %s",
        f"{num_users:,}",
    )

    return {
        "games": games,
        "metadata": metadata,
        "game_lookup": game_lookup,
        "catalog_entries": catalog_entries,
        "catalog_by_tag": catalog_by_tag,
        "catalog_tags": catalog_tags,
        "recommender": recommender,
        "app_ids": app_ids,
        "db_path": db_path,
        "num_interactions": num_interactions,
        "num_users": num_users,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando API de recomendação...")

    STATE.update(load_data_for_api())

    logger.info(
        "Modelo FBC pronto! %s jogos indexados.",
        f"{len(STATE['app_ids']):,}",
    )

    logger.info(
        "Interações disponíveis no SQLite: %s",
        f"{STATE['num_interactions']:,}",
    )

    try:
        yield
    finally:
        STATE.clear()
        logger.info("API finalizada.")


app = FastAPI(
    title="O Que Temos Hoje? — API de Recomendação FBC",
    description=(
        "API de Filtragem Baseada em Conteúdo "
        "(TF-IDF + Similaridade do Cosseno) para jogos da Steam. "
        "O catálogo é mantido em memória e os históricos são "
        "consultados diretamente no SQLite. "
        "Também oferece recomendações cold-start a partir "
        "de preferências informadas pelo usuário."
    ),
    version="0.8.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    response_model=HealthResponse,
)
def health_check() -> HealthResponse:
    """Verifica se a API e o modelo FBC estão ativos."""

    app_ids = STATE.get("app_ids", [])

    return HealthResponse(
        status="ok" if len(app_ids) > 0 else "starting",
        service="recomendacao-fbc-api",
        num_games=len(app_ids),
        num_interactions=STATE.get("num_interactions", 0),
    )


@app.get("/games")
def get_games(
    search: str | None = Query(
        default=None,
        min_length=1,
        max_length=200,
        description="Pesquisa por título ou descrição do jogo.",
    ),
    tag: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
        description="Filtra jogos por uma tag específica.",
    ),
    limit: int = Query(
        default=24,
        ge=1,
        le=100,
        description="Quantidade máxima de jogos por página.",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Quantidade de registros a ignorar.",
    ),
) -> dict[str, Any]:
    """Retorna uma página do catálogo de jogos."""

    db_path: Path | None = STATE.get("db_path")

    if db_path is None:
        raise HTTPException(
            status_code=503,
            detail="Catálogo temporariamente indisponível.",
        )

    search = search.strip() if search else None
    tag = tag.strip() if tag else None

    catalog_entries: list[dict[str, Any]] | None = STATE.get("catalog_entries")
    catalog_by_tag: dict[str, list[dict[str, Any]]] | None = STATE.get("catalog_by_tag")

    if catalog_entries is not None and catalog_by_tag is not None:
        base_pool = (
            catalog_by_tag.get(tag.lower(), [])
            if tag
            else catalog_entries
        )

        if search:
            term_lower = search.lower()
            filtered = [
                entry["serialized"]
                for entry in base_pool
                if term_lower in entry["search_blob"]
            ]
            total = len(filtered)
            games = filtered[offset : offset + limit]
        else:
            total = len(base_pool)
            games = [
                entry["serialized"]
                for entry in base_pool[offset : offset + limit]
            ]

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(games) < total,
            "games": games,
        }

    try:
        total = count_games_filtered(
            search=search,
            tag=tag,
            db_path=db_path,
        )

        rows = load_games_page(
            search=search,
            tag=tag,
            limit=limit,
            offset=offset,
            db_path=db_path,
        )

        games = [
            _serialize_catalog_game(row)
            for row in rows
        ]

    except Exception as error:
        logger.exception("Erro ao consultar o catálogo de jogos.")

        raise HTTPException(
            status_code=500,
            detail="Erro interno ao consultar o catálogo.",
        ) from error

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(games) < total,
        "games": games,
    }


@app.get("/tags")
def get_tags() -> dict[str, Any]:
    """Retorna todas as tags disponíveis no catálogo."""

    db_path: Path | None = STATE.get("db_path")

    if db_path is None:
        raise HTTPException(
            status_code=503,
            detail="Catálogo temporariamente indisponível.",
        )

    cached_tags: list[str] | None = STATE.get("catalog_tags")
    if cached_tags is not None:
        return {
            "total": len(cached_tags),
            "tags": cached_tags,
        }

    try:
        tags = load_catalog_tags(db_path=db_path)

    except Exception as error:
        logger.exception("Erro ao consultar as tags do catálogo.")

        raise HTTPException(
            status_code=500,
            detail="Erro interno ao consultar as tags.",
        ) from error

    return {
        "total": len(tags),
        "tags": tags,
    }


@app.get("/users/search")
def search_users(
    user_id: int | None = Query(
        default=None,
        ge=0,
        description="Identificador exato do usuário.",
    ),
    after: int | None = Query(
        default=None,
        ge=0,
        description="Cursor para continuar a paginação.",
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Quantidade máxima de usuários por página.",
    ),
) -> dict[str, Any]:
    """
    Busca um usuário específico ou lista usuários com paginação.

    A paginação utiliza keyset pagination baseada em user_id.
    """

    db_path: Path | None = STATE.get("db_path")

    if db_path is None:
        raise HTTPException(
            status_code=503,
            detail="Serviço de usuários temporariamente indisponível.",
        )

    if user_id is not None and after is not None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Não utilize user_id e after simultaneamente. "
                "Escolha entre busca exata e paginação."
            ),
        )

    try:
        # Busca exata por identificador.
        if user_id is not None:
            user_df = load_users(
                user_id=user_id,
                db_path=db_path,
            )

            users = user_df.to_dict(orient="records")

            return {
                "search_mode": "exact",
                "total": len(users),
                "limit": 1,
                "after": None,
                "next_cursor": None,
                "has_more": False,
                "users": users,
            }

        # Consulta uma linha adicional para identificar a próxima página.
        rows = load_users_page(
            after=after,
            limit=limit + 1,
            db_path=db_path,
        )

        has_more = len(rows) > limit
        users = rows[:limit]

        next_cursor = (
            users[-1]["user_id"]
            if has_more and users
            else None
        )

        total = STATE.get("num_users", 0)

        return {
            "search_mode": "paginated",
            "total": total,
            "limit": limit,
            "after": after,
            "next_cursor": next_cursor,
            "has_more": has_more,
            "users": users,
        }

    except Exception as error:
        logger.exception("Erro ao consultar usuários.")

        raise HTTPException(
            status_code=500,
            detail="Erro interno ao consultar usuários.",
        ) from error


def _build_profile_response(
    profile_data: dict,
    game_lookup: dict[int, dict[str, Any]],
) -> UserProfileSummary:
    """Converte o resumo do perfil do recomendador para o schema da API."""

    history = []

    for item in profile_data.get("history_with_weight", []):
        app_id = int(item["app_id"])
        game_data = game_lookup.get(app_id)
        title = (
            game_data.get("title")
            if game_data is not None
            else f"Jogo {app_id}"
        )

        history.append(
            HistoryInteraction(
                **item,
                title=title,
            )
        )

    top_tags = [
        ProfileFeature(**item)
        for item in profile_data.get("top_tags", [])
    ]

    top_terms = [
        ProfileFeature(**item)
        for item in profile_data.get("top_terms", [])
    ]

    return UserProfileSummary(
        total_hours=profile_data.get("total_hours", 0.0),
        valid_games=profile_data.get("valid_games", 0),
        valid_interactions=profile_data.get("valid_interactions", 0),
        positive_interactions=profile_data.get("positive_interactions", 0),
        negative_interactions=profile_data.get("negative_interactions", 0),
        top_tags=top_tags,
        top_terms=top_terms,
        history_with_weight=history,
    )


def _build_explanation_response(
    explanation_data: dict,
    game_lookup: dict[int, dict[str, Any]],
) -> RecommendationExplanation:
    """Monta a explicação de uma recomendação."""

    similar_data = explanation_data.get("most_similar_consumed")
    similar_game = None

    if similar_data is not None:
        similar_app_id = int(similar_data["app_id"])
        similar_game_data = game_lookup.get(similar_app_id)

        if similar_game_data is not None:
            similar_game = SimilarGameResponse(
                app_id=similar_app_id,
                title=similar_game_data["title"],
                similarity=similar_data["similarity"],
                hours=similar_data.get("hours", 0.0),
                is_recommended=similar_data.get(
                    "is_recommended",
                    True,
                ),
            )

    matched_tags = [
        FeatureContribution(**item)
        for item in explanation_data.get("matched_tags", [])
    ]

    matched_terms = [
        FeatureContribution(**item)
        for item in explanation_data.get("matched_terms", [])
    ]

    return RecommendationExplanation(
        most_similar_consumed=similar_game,
        matched_tags=matched_tags,
        matched_terms=matched_terms,
        breakdown=explanation_data.get("breakdown", {}),
    )


@app.post(
    "/recommendations/cold-start",
    response_model=ColdStartResponse,
)
def get_cold_start_recommendations(
    request: ColdStartRequest,
) -> ColdStartResponse:
    """Gera recomendações para novos usuários sem histórico de interações."""

    recommender: ContentBasedRecommender | None = STATE.get(
        "recommender"
    )

    game_lookup: dict[int, dict[str, Any]] = STATE.get(
        "game_lookup",
        {},
    )

    if recommender is None or not game_lookup:
        raise HTTPException(
            status_code=503,
            detail="Serviço de recomendação temporariamente indisponível.",
        )

    if not request.app_ids and not request.tags:
        raise HTTPException(
            status_code=422,
            detail=(
                "Informe pelo menos um jogo ou uma tag "
                "como preferência."
            ),
        )

    try:
        result = recommender.recommend_from_preferences(
            app_ids=request.app_ids,
            tags=request.tags,
            top_n=request.top_n,
        )

    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    except Exception as error:
        logger.exception(
            "Erro ao gerar recomendações cold-start."
        )

        raise HTTPException(
            status_code=500,
            detail="Erro interno ao gerar recomendações cold-start.",
        ) from error

    try:
        profile_response = ColdStartProfileSummary(
            **result["profile"]
        )

        complete_recommendations = []

        for recommendation in result["recommendations"]:
            app_id = int(recommendation["app_id"])
            game_data = game_lookup.get(app_id)

            if game_data is None:
                logger.warning(
                    "Jogo cold-start %s não encontrado no catálogo.",
                    app_id,
                )
                continue

            explanation = _build_explanation_response(
                recommendation.get("explanation") or {},
                game_lookup,
            )

            complete_recommendations.append(
                GameRecommendation(
                    **game_data,
                    similarity=recommendation["similarity"],
                    explanation=explanation,
                )
            )

        return ColdStartResponse(
            top_n=result["top_n"],
            profile=profile_response,
            recommendations=complete_recommendations,
        )

    except Exception as error:
        logger.exception(
            "Erro ao montar a resposta das recomendações cold-start."
        )

        raise HTTPException(
            status_code=500,
            detail="Erro interno ao montar as recomendações.",
        ) from error


@app.get(
    "/users/{user_id}/recommendations",
    response_model=RecommendationResponse,
)
def get_user_recommendations(
    user_id: int,
    top_n: int = Query(default=10, ge=1, le=50),
    exclude_consumed: bool = Query(default=True),
) -> RecommendationResponse:
    """Retorna recomendações Top-N completas para um usuário."""

    recommender: ContentBasedRecommender | None = STATE.get(
        "recommender"
    )

    db_path: Path | None = STATE.get("db_path")

    game_lookup: dict[int, dict[str, Any]] = STATE.get(
        "game_lookup",
        {},
    )

    if recommender is None or db_path is None or not game_lookup:
        raise HTTPException(
            status_code=503,
            detail="Serviço de recomendação temporariamente indisponível.",
        )

    try:
        recommendations_df = load_recommendations(
            user_id=user_id,
            db_path=db_path,
        )
    except Exception as error:
        logger.exception(
            "Erro ao consultar histórico do usuário %s.",
            user_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Erro interno ao consultar o histórico do usuário.",
        ) from error

    if recommendations_df.empty:
        raise HTTPException(
            status_code=404,
            detail="Histórico não encontrado para este usuário.",
        )

    try:
        detailed_results = recommender.recommend_detailed(
            user_id=user_id,
            recommendations=recommendations_df,
            top_n=top_n,
            exclude_consumed=exclude_consumed,
        )
    except Exception as error:
        logger.exception(
            "Erro ao gerar recomendações para o usuário %s.",
            user_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Erro interno ao gerar recomendações.",
        ) from error

    if not detailed_results:
        raise HTTPException(
            status_code=422,
            detail=(
                "Não foi possível gerar recomendações para este histórico. "
                "Verifique se existem avaliações positivas e jogos "
                "elegíveis para recomendação."
            ),
        )

    profile_data = detailed_results[0].get("profile", {})
    profile_response = _build_profile_response(
        profile_data,
        game_lookup,
    )

    complete_recommendations = []

    for result in detailed_results:
        app_id = int(result["app_id"])
        game_data = game_lookup.get(app_id)

        if game_data is None:
            logger.warning(
                "Jogo recomendado %s não encontrado no catálogo.",
                app_id,
            )
            continue

        explanation = _build_explanation_response(
            result.get("explanation") or {},
            game_lookup,
        )

        complete_recommendations.append(
            GameRecommendation(
                **game_data,
                similarity=result["similarity"],
                explanation=explanation,
            )
        )

    if not complete_recommendations:
        raise HTTPException(
            status_code=500,
            detail="Não foi possível recuperar os jogos recomendados.",
        )

    return RecommendationResponse(
        user_id=user_id,
        top_n=top_n,
        exclude_consumed=exclude_consumed,
        profile=profile_response,
        recommendations=complete_recommendations,
    )

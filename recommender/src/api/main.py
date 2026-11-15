from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from ..data.loader import RAW_DIR, load_games, load_metadata, load_users
from ..data.preprocess import build_item_vectors
from ..models.recommender import ContentBasedRecommender
from .schemas import HealthResponse, RecommendationResponse

# Estado global carregado uma única vez no startup
STATE: dict[str, Any] = {}


def load_data_for_api(raw_dir: Path = RAW_DIR, max_interactions: int = 500_000) -> dict[str, Any]:
    """Carrega o catálogo, constrói a matriz TF-IDF + Tags e lê as interações."""
    games = load_games(raw_dir / "games.csv")
    metadata = load_metadata(raw_dir / "games_metadata.json")

    # Lê uma amostra de interações para inicialização rápida na apresentação
    recs_path = raw_dir / "recommendations.csv"
    recommendations = pd.read_csv(
        recs_path,
        usecols=["app_id", "is_recommended", "hours", "user_id"],
        nrows=max_interactions,
    )

    item_matrix, app_ids, features = build_item_vectors(games, metadata)
    recommender = ContentBasedRecommender(
        item_matrix=item_matrix,
        app_ids=app_ids,
        features=features,
    )

    return {
        "games": games,
        "recommendations": recommendations,
        "recommender": recommender,
        "app_ids": app_ids,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Carregando catálogo e construindo matriz de conteúdo (TF-IDF + Tags)...")
    STATE.update(load_data_for_api())
    print(f"Modelo FBC pronto! {len(STATE['app_ids'])} jogos indexados.")
    yield
    STATE.clear()


app = FastAPI(
    title="O Que Temos Hoje? — API de Recomendação FBC",
    description="API de Filtragem Baseada em Conteúdo (TF-IDF + Similaridade do Cosseno) para jogos da Steam.",
    version="0.1.0",
    lifespan=lifespan,
)

# OBRIGATÓRIO: Liberar CORS para o frontend React (Vite roda em localhost:5173)
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


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Verifica se o servidor e o modelo FBC estão ativos."""
    recs = STATE.get("recommendations")
    app_ids = STATE.get("app_ids", [])
    return HealthResponse(
        status="ok",
        service="recomendacao-fbc-api",
        num_games=len(app_ids),
        num_interactions=len(recs) if recs is not None else 0,
    )


@app.get("/users/{user_id}/recommendations", response_model=RecommendationResponse)
def get_user_recommendations(
    user_id: int,
    top_n: int = Query(default=10, ge=1, le=50),
    exclude_consumed: bool = Query(default=True),
) -> RecommendationResponse:
    """Retorna a lista Top-N de jogos recomendados para um user_id."""
    recommender: ContentBasedRecommender | None = STATE.get("recommender")
    recommendations_df: pd.DataFrame | None = STATE.get("recommendations")

    if recommender is None or recommendations_df is None:
        raise HTTPException(status_code=503, detail="Modelo FBC ainda não carregado.")

    rec_ids = recommender.recommend(
        user_id=user_id,
        recommendations=recommendations_df,
        top_n=top_n,
        exclude_consumed=exclude_consumed,
    )

    if not rec_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Usuário {user_id} não encontrado ou sem histórico válido.",
        )

    return RecommendationResponse(
        user_id=user_id,
        top_n=top_n,
        exclude_consumed=exclude_consumed,
        recommendations=rec_ids,
    )
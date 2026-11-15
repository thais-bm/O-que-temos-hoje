from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "recomendacao-fbc-api"
    num_games: int
    num_interactions: int


class RecommendationResponse(BaseModel):
    user_id: int
    top_n: int
    exclude_consumed: bool
    recommendations: list[int] = Field(
        description="Lista ordenada de app_ids recomendados pelo modelo FBC"
    )

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "recomendacao-fbc-api"
    num_games: int
    num_interactions: int


class FeatureContribution(BaseModel):
    label: str
    contribution: float
    profile_weight: float


class ProfileFeature(BaseModel):
    label: str
    weight: float


class HistoryInteraction(BaseModel):
    app_id: int
    title: str | None = None
    hours: float
    is_recommended: bool
    weight: float
    weight_share_pct: float


class UserProfileSummary(BaseModel):
    total_hours: float
    valid_games: int
    valid_interactions: int
    positive_interactions: int
    negative_interactions: int
    top_tags: list[ProfileFeature] = Field(default_factory=list)
    top_terms: list[ProfileFeature] = Field(default_factory=list)
    history_with_weight: list[HistoryInteraction] = Field(
        default_factory=list
    )


class ColdStartRequest(BaseModel):
    app_ids: list[int] = Field(
        default_factory=list,
        max_length=20,
        description="Jogos escolhidos como referência.",
    )
    tags: list[str] = Field(
        default_factory=list,
        max_length=50,
        description="Tags de preferência escolhidas pelo usuário.",
    )
    top_n: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Quantidade de recomendações desejadas.",
    )


class ColdStartProfileSummary(BaseModel):
    reference_app_ids: list[int] = Field(default_factory=list)
    selected_tags: list[str] = Field(default_factory=list)
    num_reference_games: int
    num_selected_tags: int
    top_tags: list[ProfileFeature] = Field(default_factory=list)
    top_terms: list[ProfileFeature] = Field(default_factory=list)


class SimilarGameResponse(BaseModel):
    app_id: int
    title: str
    similarity: float = Field(ge=-1.0, le=1.0)
    hours: float = 0.0
    is_recommended: bool = True


class RecommendationExplanation(BaseModel):
    most_similar_consumed: SimilarGameResponse | None = None
    matched_tags: list[FeatureContribution] = Field(
        default_factory=list
    )
    matched_terms: list[FeatureContribution] = Field(
        default_factory=list
    )
    breakdown: dict[str, float] = Field(default_factory=dict)


class GameRecommendation(BaseModel):
    app_id: int
    title: str
    similarity: float = Field(ge=-1.0, le=1.0)
    rating: str | None = None
    positive_ratio: float | None = None
    user_reviews: int | None = None
    date_release: str | None = None
    price_final: float | None = None
    price_original: float | None = None
    discount: float | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    explanation: RecommendationExplanation = Field(
        default_factory=RecommendationExplanation
    )


class RecommendationResponse(BaseModel):
    user_id: int
    top_n: int
    exclude_consumed: bool
    profile: UserProfileSummary
    recommendations: list[GameRecommendation] = Field(
        description="Lista ordenada de jogos recomendados pelo modelo FBC"
    )


class ColdStartResponse(BaseModel):
    top_n: int
    profile: ColdStartProfileSummary
    recommendations: list[GameRecommendation] = Field(
        description="Recomendações geradas a partir de preferências iniciais."
    )

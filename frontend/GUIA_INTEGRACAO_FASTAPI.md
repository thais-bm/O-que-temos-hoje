# Guia de Implementação da API FastAPI (Integração com o Frontend)

Este documento serve como guia prático para a equipe de **Backend / Modelagem** implementar a API em `recommender/src/api/` de forma 100% compatível com o frontend React já construído em `frontend/`.

---

## 1. Visão Geral da Integração

O frontend React (`http://localhost:5173`) já possui o cliente HTTP configurado em `frontend/src/services/api.js` apontando para `http://localhost:8000`.

- Assim que o servidor FastAPI estiver rodando na porta `8000`, o frontend detecta automaticamente via `GET /health` e muda o status no rodapé para **"Conectado ao servidor FastAPI"**.
- Quando um **Usuário Já Existente** é selecionado ou buscado pelo `Steam ID`, o frontend consulta `GET /users/{user_id}/recommendations`.

---

## 2. Estrutura de Arquivos Sugerida

Dentro de `recommender/src/api/`, crie os seguintes arquivos:

```text
recommender/
└── src/
    └── api/
        ├── __init__.py
        ├── schemas.py      # Modelos Pydantic de entrada e saída (contratos JSON)
        └── main.py         # Aplicação FastAPI, CORS, carga do modelo no startup e rotas
```

---

## 3. Instalação das Dependências no `recommender/`

No arquivo `recommender/pyproject.toml`, adicione `fastapi` e `uvicorn` às dependências do projeto:

```bash
cd recommender
uv add fastapi "uvicorn[standard]"
```

Ou adicione manualmente em `recommender/pyproject.toml`:

```toml
dependencies = [
    "pandas>=2.2.0",
    "numpy>=1.26.0",
    "scikit-learn>=1.4.0",
    "nltk>=3.8.1",
    "fastapi>=0.110.0",
    "uvicorn[standard]>=0.29.0",
]
```

Depois rode:

```bash
uv sync
```

---

## 4. Contrato dos Endpoints (O que o Frontend espera)

### 4.1. `GET /health`
Usado pelo frontend ao carregar a página para saber se a API está ativa.

**Resposta esperada (`200 OK`):**
```json
{
  "status": "ok",
  "service": "recomendacao-fbc-api",
  "num_games": 50872
}
```

---

### 4.2. `GET /users/{user_id}/recommendations`
Gera o ranking Top-N para um usuário existente usando `ContentBasedRecommender.recommend()`.

**Query Params:**
- `top_n` (`int`, padrão `10`): quantidade de jogos recomendados.
- `exclude_consumed` (`bool`, padrão `true`): não recomendar jogos que o usuário já jogou.

**Exemplo de chamada feita pelo frontend:**
```http
GET http://localhost:8000/users/51580/recommendations?top_n=10&exclude_consumed=true
```

**Resposta esperada (`200 OK`):**
O frontend (`frontend/src/services/api.js`) aceita tanto uma lista direta de IDs quanto um objeto com a chave `recommendations`:

```json
{
  "user_id": 51580,
  "top_n": 10,
  "exclude_consumed": true,
  "recommendations": [292030, 1091500, 1245620, 374320, 1174180]
}
```

*(Opcionalmente, cada item de `recommendations` também pode ser um objeto `{"app_id": 292030, "similarity": 0.68}`).*

---

### 4.3. `GET /evaluation` (Opcional)
Retorna as métricas calculadas pelo módulo `recommender/src/evaluation/evaluator.py` comparando o modelo FBC contra os baselines (`popularidade` e `aleatório`).

**Resposta esperada (`200 OK`):**
```json
{
  "protocol": {
    "split": "80% treino / 20% teste por usuário",
    "seed": 42
  },
  "models": [
    {
      "id": "fbc_complete",
      "name": "FBC (TF-IDF + Tags + Numéricos)",
      "metrics": {
        "5": { "precision": 0.245, "recall": 0.182, "ndcg": 0.291 },
        "10": { "precision": 0.210, "recall": 0.312, "ndcg": 0.318 }
      },
      "coverage": 0.684
    }
  ]
}
```

---

## 5. Código Base Completo para `recommender/src/api/`

### 5.1. `recommender/src/api/schemas.py`

```python
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
```

### 5.2. `recommender/src/api/main.py`

> **Dica importante sobre memória e tempo de inicialização:**
> O arquivo `data/raw/recommendations.csv` completo tem **~1.9 GB** (41 milhões de linhas). Carregar tudo na inicialização pode levar vários minutos. Durante o desenvolvimento e na apresentação ao vivo, recomenda-se limitar a leitura inicial (ou salvar uma amostra/matriz pré-processada em `data/processed/`) para o servidor subir em poucos segundos.

```python
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
```

---

## 6. Como Executar e Testar

1. **Subir a API FastAPI:**
   ```bash
   cd recommender
   uv run uvicorn src.api.main:app --reload --port 8000
   ```

2. **Testar no navegador (Swagger UI automático):**
   - Acesse `http://localhost:8000/docs`
   - Teste a rota `GET /health`
   - Teste `GET /users/51580/recommendations?top_n=10`

3. **Subir o Frontend React:**
   ```bash
   cd frontend
   npm start
   ```
   - Acesse `http://localhost:5173`
   - O rodapé da página exibirá automaticamente **"Conectado ao servidor FastAPI"**.

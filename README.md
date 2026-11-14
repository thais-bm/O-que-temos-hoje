# Recomendação FBC — Filtragem Baseada em Conteúdo

Sistema de recomendação de jogos (Steam) baseado em TF-IDF + similaridade do cosseno.

## Stack

- **Backend**: FastAPI (Python) — expõe a API de recomendações e serve o modelo de filtragem baseada em conteúdo.
- **Frontend**: React — interface de demonstração que consome a API do FastAPI.
- **Engine de recomendação**: Python (pandas, scikit-learn, numpy, nltk) — TF-IDF + similaridade do cosseno.

## Estrutura

```
data/raw/                # Dados brutos da Steam (não versionados)
data/processed/          # Dados processados (gerados)
recommender/             # Projeto Python (uv) — Motor de recomendação, avaliação e API
  ├── src/data/          # Engenharia de dados: carregamento, limpeza, pré-processamento
  ├── src/models/        # Modelo de recomendação (perfil do usuário, similaridade do cosseno, Top-N)
  ├── src/evaluation/    # Avaliação: treino/teste, Precision@N, Recall@N, nDCG@N, baselines, cobertura
  ├── api/               # Backend FastAPI (rotas de recomendação)
  ├── tests/             # Testes automatizados (pytest)
  └── pyproject.toml     # Dependências e configuração do projeto Python
frontend/                # Frontend React (interface de demonstração)
```

## 1. Pré-requisitos

- Python >= 3.10
- [uv](https://github.com/astral-sh/uv) (recomendado)
- Node.js >= 18 (para o frontend React)

## 2. Instalação

Crie o ambiente Python e instale as dependências:

```bash
cd recommender
uv venv
uv sync
```

Instale as dependências do frontend React:

```bash
cd frontend
npm install
```

## 3. Dados

Os arquivos brutos (`games.csv`, `games_metadata.json`, `users.csv`, `recommendations.csv`) devem ficar em `data/raw/` na raiz do repositório. Eles não são versionados (veja `.gitignore`).

## 4. Execução

### Preparar os dados (engenharia de dados)

```bash
cd recommender
uv run python -m src.data.pipeline
```

### Rodar o backend (FastAPI)

```bash
cd recommender
uv run uvicorn api.main:app --reload
```

### Rodar o frontend (React)

```bash
cd frontend
npm start
```

## 5. Requisitos do trabalho

- Similaridade do cosseno obrigatória.
- Não recomendar itens já consumidos pelo usuário.
- Baselines: recomendação aleatória e itens mais populares.
- Métricas: Precision@N, Recall@N, nDCG@N (N=5 e N=10), média sobre usuários.
- Pelo menos uma métrica de cobertura/diversidade/novidade.
- Semente aleatória fixa (reprodutibilidade).

## 6. Status da implementação

### ✅ Pronto

- **Engenharia de dados** (`recommender/src/data/`): carregamento de arquivos brutos, limpeza de texto (stopwords EN/PT, stemming), construção de vetores de itens (TF-IDF + multi-hot tags + numéricos escalonados) e perfis de usuário (média ponderada por horas). Pipeline validado com dados reais.
- **Modelo de recomendação** (`recommender/src/models/`): `ContentBasedRecommender` com similaridade do cosseno, Top-N e exclusão de itens já consumidos.
- **Avaliação** (`recommender/src/evaluation/`): split treino/teste, Precision@N, Recall@N, nDCG@N, baselines (popularidade e aleatório), métrica de cobertura.
- **Testes** (`recommender/tests/`): `test_recommender.py`, `test_evaluator.py`, `test_pipeline.py` (13/13 passando).
- **README**: documentação da stack React + FastAPI e instruções de execução.

### 🔲 TO DO

- **Backend FastAPI** (`recommender/api/`): criar `api/main:app` com endpoints de recomendação consumindo `ContentBasedRecommender`.
- **Frontend React** (`frontend/`): interface de demonstração que consome a API.
- **Avaliação completa** com o dataset real (validação de Precision@N/Recall@N/nDCG@N em escala).

## 7. Licença

MIT — veja `LICENSE`.

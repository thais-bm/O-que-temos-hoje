# Recomendação FBC — Filtragem Baseada em Conteúdo

Sistema de recomendação de jogos (Steam) baseado em TF-IDF + similaridade do cosseno.

## Stack

- **Backend**: FastAPI (Python) — expõe a API de recomendações e serve o modelo de filtragem baseada em conteúdo.
- **Frontend**: React — interface de demonstração que consome a API do FastAPI.
- **Engine de recomendação**: Python (pandas, scikit-learn, numpy, nltk) — TF-IDF + similaridade do cosseno.

## Estrutura

```
src/data/        # Engenharia de dados: carregamento, limpeza, pré-processamento
src/models/      # Modelo de recomendação (perfil do usuário, similaridade do cosseno, Top-N)
src/evaluation/  # Avaliação: treino/teste, Precision@N, Recall@N, nDCG@N, baselines, cobertura
src/app/         # Frontend React (interface de demonstração)
api/             # Backend FastAPI (rotas de recomendação)
data/raw/        # Dados brutos (não versionados)
data/processed/  # Dados processados (gerados)
tests/           # Testes automatizados (pytest)
scripts/         # Scripts auxiliares
```

## 1. Pré-requisitos

- Python >= 3.10
- [uv](https://github.com/astral-sh/uv) (recomendado)
- Node.js >= 18 (para o frontend React)

## 2. Instalação

Crie o ambiente Python e instale as dependências:

```bash
uv venv
uv sync
```

Instale as dependências do frontend React:

```bash
cd src/app
npm install
```

## 3. Dados

Os arquivos brutos (`games.csv`, `games_metadata.json`, `users.csv`, `recommendations.csv`) devem ficar em `data/raw/`. Eles não são versionados (veja `.gitignore`).

## 4. Execução

### Preparar os dados (engenharia de dados)

```bash
uv run python -m src.data.pipeline
```

### Rodar o backend (FastAPI)

```bash
uv run uvicorn api.main:app --reload
```

### Rodar o frontend (React)

```bash
cd src/app
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

- **Engenharia de dados** (`src/data/`): carregamento de arquivos brutos, limpeza de texto (stopwords EN/PT, stemming), construção de vetores de itens (TF-IDF + multi-hot tags + numéricos escalonados) e perfis de usuário (média ponderada por horas). Pipeline validado com dados reais.
- **Modelo de recomendação** (`src/models/`): `ContentBasedRecommender` com similaridade do cosseno, Top-N e exclusão de itens já consumidos.
- **Avaliação** (`src/evaluation/`): split treino/teste, Precision@N, Recall@N, nDCG@N, baselines (popularidade e aleatório), métrica de cobertura.
- **Testes** (`tests/`): `test_recommender.py`, `test_evaluator.py`, `test_pipeline.py` (escritos, não executados ainda).
- **README**: documentação da stack React + FastAPI e instruções de execução.

### 🔲 TO DO

- **Backend FastAPI** (`api/`): criar `api/main:app` com endpoints de recomendação consumindo `ContentBasedRecommender`.
- **Frontend React** (`src/app/`): interface de demonstração que consome a API.
- **Executar testes pytest** e garantir cobertura.
- **Avaliação completa** com o dataset real (validação de Precision@N/Recall@N/nDCG@N em escala).

## 7. Licença

MIT — veja `LICENSE`.

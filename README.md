# O Que Temos Hoje? — Recomendador de Jogos Steam

Sistema de recomendação por **Filtragem Baseada em Conteúdo (FBC)** para jogos
da Steam. Combina TF-IDF sobre descrições, multi-hot de tags e atributos
numéricos para construir perfis de usuário e gerar recomendações Top-N por
similaridade do cosseno, com explicações das características combinadas.

## Estrutura do repositório

```
.
├── data/                 # Dados brutos (CSV/JSONL) e banco SQLite gerado
│   ├── raw/              # games.csv, users.csv, recommendations.csv, games_metadata.json
│   └── steam.db          # Banco SQLite (gerado por scripts/import_steam_db.py)
├── frontend/             # React + Material UI (consome a API FastAPI)
├── notebooks/            # Análise exploratória de dados (EDA)
│   ├── eda.py            # Script de EDA
│   ├── eda.ipynb         # Notebook Jupyter equivalente
│   └── eda_resumo.txt    # Saída textual da EDA
├── recommender/          # Backend Python (FastAPI + recomendação)
│   ├── pyproject.toml    # Dependências e config do pacote
│   ├── src/              # Código-fonte (api, data, evaluation, models)
│   ├── tests/            # Testes automatizados (pytest)
│   ├── scripts/          # evaluate.py (avaliação offline)
│   ├── results/          # evaluation_results.csv
│   ├── RELATORIO_AVALIACAO.md   # Protocolo e resultados da avaliação
│   └── uv.lock           # Lockfile do uv
├── scripts/import_steam_db.py  # Importa dados brutos para o SQLite
└── INSTRUCOES.md         # Requisitos e papéis do projeto
```

## Começando rápido

### Pré-requisitos

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) (recomendado) ou pip/virtualenv

### 1. Importar os dados para o SQLite

```bash
python scripts/import_steam_db.py
```

Isso lê os arquivos de `data/raw/` e cria `data/steam.db` com as tabelas
`games`, `users`, `recommendations` e `game_metadata`.

### 2. Subir o backend (FastAPI)

```bash
cd recommender
uv run uvicorn src.api.main:app --reload --port 8000
```

O backend expõe:
- `GET /health` — saúde da API
- `GET /games` — catálogo paginado
- `GET /tags` — tags disponíveis
- `GET /users/search` — busca de usuários
- `GET /users/{user_id}/recommendations` — recomendações para um usuário
- `POST /recommendations/cold-start` — recomendações sem histórico

### 3. Subir o frontend (React)

```bash
cd frontend
npm install          # (ou yarn)
npm run dev          # servidor de desenvolvimento em http://localhost:5173
```

O frontend está configurado para consumir `http://localhost:8000` por padrão
(`DEFAULT_API_URL` em `frontend/src/services/api.js`).

## Testes automatizados

Os testes estão em `recommender/tests/` e rodam com `pytest`:

```bash
cd recommender
uv run pytest tests/
```

## Avaliação offline

Executa o protocolo treino/teste com Precision@N, Recall@N, nDCG@N, baselines
e cobertura:

```bash
cd recommender
uv run python scripts/evaluate.py --users 100 --seed 42
```

Resultados em `recommender/results/evaluation_results.csv` e relatório em
`recommender/RELATORIO_AVALIACAO.md`.

## Análise exploratória (EDA)

Executa estatísticas descritivas sobre jogos, usuários, recomendações e
metadados:

```bash
python notebooks/eda.py
```

Ou abra `notebooks/eda.ipynb` no Jupyter. A saída textual fica em
`notebooks/eda_resumo.txt`.

## Licença

MIT — veja `LICENSE`.

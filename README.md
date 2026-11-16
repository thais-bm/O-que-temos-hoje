# O Que Temos Hoje? — Recomendador de Jogos Steam (FBC)

Sistema de recomendação por **Filtragem Baseada em Conteúdo (FBC)** para jogos da Steam. O pipeline combina **TF-IDF** sobre descrições (com pré-processamento e *stemming*), representação *multi-hot* de tags e atributos numéricos normalizados (`price_final` e `discount`) para construir perfis de usuário ponderados pelo tempo de jogo e gerar listas **Top-N** por **similaridade do cosseno**, com exclusão de itens já consumidos, suporte a *cold start* e explicações detalhadas das recomendações.

> Consulte [INSTRUCOES.md](INSTRUCOES.md) para os requisitos completos da disciplina e critérios de avaliação.

---

## Equipe e papéis

| Membro          | Papel principal | Responsabilidades no projeto |
| --------------- | --------------- | ---------------------------- |
| Erick Roberto   | **Engenharia de Dados (Ingestão), API e Apresentação** | Criação do script inicial de ingestão para o SQLite (`scripts/import_steam_db.py`), criação inicial da API FastAPI e esquemas base (`recommender/src/api/`), elaboração dos slides e gravação do vídeo de demonstração. |
| Júlio Cleiton   | **Integração Backend–Frontend e Avaliação Experimental** | Adaptação do backend e pipeline para consultas ao banco SQLite, expansão dos endpoints da API, integração backend–frontend (`frontend/src/services/api.js` e `App.jsx`) e implementação do script de avaliação offline (`recommender/scripts/evaluate.py`). |
| Thaís Carolina  | **Produto, Interface Web, Documentação e Performance** | Estruturação do repositório, `README.md`, interface completa em React + Material UI (`frontend/`), automação de inicialização (`scripts/start_app.py`, `start.ps1`), aceleração da importação do banco com DuckDB, otimizações de desempenho e correções de TF-IDF/UX. |
| Victor Andrews  | **Modelagem FBC, Avaliação, EDA e Relatório Técnico** | Implementação do pipeline FBC e vetorização (`recommender/src/data/`, `recommender/src/models/`), protocolo de avaliação, métricas e baselines (`recommender/src/evaluation/`), suíte de testes (`recommender/tests/`), EDA (`notebooks/`), `RELATORIO_AVALIACAO.md` e `RELATORIO_TECNICO.tex`. |

## Vídeo de demonstração

- Link do vídeo (até 3 minutos): `[Adicionar link do vídeo antes da entrega]`

---

## Estrutura do repositório

```text
.
├── data/
│   ├── raw/                  # Arquivos brutos do dataset Steam (não versionados no Git)
│   │   ├── games.csv
│   │   ├── users.csv
│   │   ├── recommendations.csv
│   │   └── games_metadata.json
│   ├── processed/            # Diretório auxiliar para artefatos processados
│   └── steam.db              # Banco SQLite gerado por scripts/import_steam_db.py
├── frontend/                 # Aplicação web React + Material UI (Vite)
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── components/
│       ├── data/
│       └── services/api.js
├── notebooks/                # Análise exploratória de dados (EDA)
│   ├── eda.py                # Script reproduzível da EDA
│   ├── eda.ipynb             # Notebook Jupyter equivalente
│   └── eda_resumo.txt        # Resumo textual gerado pela EDA
├── recommender/              # Pacote Python (dados, modelo FBC, avaliação e API FastAPI)
│   ├── pyproject.toml        # Dependências e configuração do projeto Python
│   ├── uv.lock               # Lockfile de dependências
│   ├── src/
│   │   ├── api/              # Servidor FastAPI (main.py, schemas.py)
│   │   ├── data/             # Loader SQLite e vetorização/perfil (loader.py, preprocess.py)
│   │   ├── evaluation/       # Split treino/teste, métricas e baselines (evaluator.py)
│   │   └── models/           # Recomendador FBC e explicabilidade (recommender.py)
│   ├── scripts/
│   │   └── evaluate.py       # Script CLI da avaliação offline
│   ├── results/
│   │   └── evaluation_results.csv
│   ├── tests/                # Testes automatizados (pytest)
│   └── RELATORIO_AVALIACAO.md
├── scripts/
│   ├── import_steam_db.py    # Importa data/raw/ para data/steam.db via DuckDB -> SQLite
│   └── start_app.py          # Inicializa banco (se necessário), backend e frontend juntos
├── INSTRUCOES.md             # Guia e requisitos do trabalho
├── RELATORIO_TECNICO.tex     # Fonte LaTeX do relatório técnico
├── start.ps1                 # Atalho PowerShell para scripts/start_app.py
└── LICENSE
```

---

## Passo a passo para instalar e executar

### 1. Pré-requisitos

- **Python 3.10+** (`requires-python = ">=3.10"` em `recommender/pyproject.toml`)
- **Node.js 18+** e **npm** (para o frontend React/Vite)
- **[uv](https://docs.astral.sh/uv/)** (recomendado para reproduzir exatamente o ambiente via `recommender/uv.lock`) ou `pip` + `venv`

### 2. Obter e preparar os dados brutos

Os arquivos brutos (`data/raw/*`) e o banco SQLite (`data/steam.db`) não são versionados no Git (`.gitignore`). Os dados vêm do dataset público **Game Recommendations on Steam**, disponível no Kaggle:

- **Fonte dos dados:** [Kaggle — Game Recommendations on Steam (`antonkozyriev/game-recommendations-on-steam`)](https://www.kaggle.com/datasets/antonkozyriev/game-recommendations-on-steam)

Antes da primeira execução, garanta uma das duas opções abaixo:

- **Gerar a partir dos arquivos do Kaggle (padrão):**
  1. Baixe e extraia o dataset no link do Kaggle acima.
  2. Copie os 4 arquivos abaixo para a pasta `data/raw/`:
     - `games.csv`
     - `users.csv`
     - `recommendations.csv`
     - `games_metadata.json`
- **Já possui `data/steam.db` pronto:** basta colocar o arquivo em `data/steam.db` (a etapa de importação será pulada automaticamente).

### 3. Executar a aplicação

#### Opção A — Inicialização automática com um único comando (Recomendado)

A partir da **raiz do repositório**, não é necessário configurar o ambiente virtual manualmente — execute diretamente com o Python do sistema:

```bash
python scripts/start_app.py
```

Ou, no Windows PowerShell:

```powershell
.\start.ps1
```

**O que esse comando faz automaticamente:**
1. **Prepara o ambiente virtual Python (`recommender/.venv`):** caso ainda não exista ou falte alguma biblioteca (`fastapi`, `uvicorn`, `duckdb`, `scikit-learn`, `pandas`, `nltk`), executa `uv sync` em `recommender/` (se o `uv` estiver instalado) ou cria `recommender/.venv` via `python -m venv` e instala com `pip install -e recommender/`.
2. **Prepara o banco SQLite (`data/steam.db`):** caso não exista, executa `scripts/import_steam_db.py` usando o `.venv` recém-preparado para importar `data/raw/` (ocorre apenas na primeira execução).
3. **Prepara o frontend (`frontend/node_modules`):** caso falte, executa `npm install` em `frontend/`.
4. **Inicia os dois servidores juntos:**
   - **Frontend Web (React + MUI):** `http://localhost:5173`
   - **Backend API (FastAPI):** `http://localhost:8000`
   - **Documentação Swagger:** `http://localhost:8000/docs`
5. Pressione `Ctrl+C` no terminal para encerrar ambos os servidores.

> **Opções úteis do `start_app.py`:** `--backend-port 8000`, `--frontend-port 5173`, `--no-reload` (desativa o `--reload` do Uvicorn para economizar memória) e `--skip-db-check`.

#### Opção B — Instalação e execução manual (dois terminais)

1. **Instalar as dependências do backend (`recommender/`):**

   Com `uv` (recomendado):

   ```bash
   cd recommender
   uv sync
   cd ..
   ```

   Ou sem `uv` (`venv` + `pip`):

   ```bash
   python -m venv recommender/.venv
   # Windows PowerShell:
   .\recommender\.venv\Scripts\Activate.ps1
   # Linux/macOS:
   # source recommender/.venv/bin/activate

   pip install -e "recommender[dev]"
   ```

2. **Instalar as dependências do frontend (`frontend/`):**

   ```bash
   cd frontend
   npm install
   cd ..
   ```

3. **Importar os dados para o SQLite** (apenas se `data/steam.db` ainda não existir):

   ```bash
   uv run --project recommender python scripts/import_steam_db.py
   ```

4. **Terminal 1 — Subir o backend (FastAPI):**

   ```bash
   cd recommender
   uv run uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
   ```

5. **Terminal 2 — Subir o frontend (React):**

   ```bash
   cd frontend
   npm run dev
   ```

6. Acesse `http://localhost:5173` no navegador.  
   *(O frontend usa `http://localhost:8000` por padrão; caso altere a porta do backend, defina a variável de ambiente `VITE_API_URL`.)*

---

## Como usar a interface de demonstração

Ao abrir `http://localhost:5173` (com o backend pronto e saudável):

1. **Usuário Existente:** informe um Steam User ID (ou selecione um dos perfis sugeridos / busque pela API) para visualizar o histórico de jogos, o perfil ponderado de gêneros/tags e as recomendações **Top-N**, clicando em qualquer card para abrir a **explicação** (contribuição de descrição TF-IDF, tags e atributos numéricos + jogo mais parecido do histórico).
2. **Novo Usuário (Cold Start):** marque tags de interesse e use a barra de busca com dropdown para selecionar jogos de referência e gerar recomendações iniciais sem histórico prévio.
3. **Explorar Catálogo:** pesquise jogos por nome/descrição e filtre por tags disponíveis no banco.

### Endpoints expostos pela API (`http://localhost:8000`)

- `GET /health` — status da API e contagem de registros carregados
- `GET /games` — catálogo paginado com busca textual e filtro por tag
- `GET /tags` — lista de tags disponíveis
- `GET /users/search` — busca por `user_id` ou listagem paginada
- `GET /users/{user_id}/recommendations` — recomendações Top-N personalizadas com explicação
- `POST /recommendations/cold-start` — recomendações sem histórico prévio

---

## Reprodução dos experimentos, testes e EDA

### Testes automatizados (`pytest`)

Executa os testes unitários e de integração do pipeline, avaliador e recomendador (`recommender/tests/`):

```bash
cd recommender
uv run pytest tests/
```

### Avaliação offline (`Precision@N`, `Recall@N`, `nDCG@N` e baselines)

Reproduz a avaliação experimental com semente fixa (`--seed 42`) comparando o modelo **FBC** com os baselines **Popularidade** e **Aleatório**, além da cobertura do catálogo:

```bash
cd recommender
uv run python scripts/evaluate.py --users 100 --seed 42
```

Os números gerados são salvos em `recommender/results/evaluation_results.csv` e analisados em `recommender/RELATORIO_AVALIACAO.md`.

### Análise exploratória de dados (EDA)

Executa as estatísticas descritivas sobre `games.csv`, `users.csv`, `recommendations.csv` e `games_metadata.json`:

```bash
uv run --project recommender python notebooks/eda.py
```

O resumo textual é salvo em `notebooks/eda_resumo.txt`. Também é possível abrir e executar o notebook `notebooks/eda.ipynb` no Jupyter.

### Verificação de lint do frontend

```bash
npm --prefix frontend run lint
```

## Demonstração do Projeto

[![Assista à demonstração](https://img.youtube.com/vi/Ukc89dVW9uk/maxresdefault.jpg)](https://youtu.be/Ukc89dVW9uk)

Clique na imagem acima para assistir à demonstração do projeto no YouTube.

---

## Licença

MIT — veja [LICENSE](LICENSE).

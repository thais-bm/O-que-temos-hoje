"""Análise exploratória de dados (EDA) do dataset Steam.

Lê diretamente dos arquivos CSV/JSONL em data/raw/ com pandas e
gera um resumo textual em notebooks/eda_resumo.txt.

Execute a partir da raiz do repositório:
    python notebooks/eda.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"
OUT_DIR = Path(__file__).resolve().parent
RESUMO_PATH = OUT_DIR / "eda_resumo.txt"


def _carregar_games() -> pd.DataFrame:
    path = RAW_DIR / "games.csv"
    return pd.read_csv(path)


def _carregar_users() -> pd.DataFrame:
    path = RAW_DIR / "users.csv"
    return pd.read_csv(path)


def _carregar_recommendations() -> pd.DataFrame:
    path = RAW_DIR / "recommendations.csv"
    return pd.read_csv(path)


def _carregar_metadata() -> list[dict]:
    path = RAW_DIR / "games_metadata.json"
    records = []
    with path.open("r", encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            records.append(json.loads(linha))
    return records


def estatisticas_gerais(
    games: pd.DataFrame,
    users: pd.DataFrame,
    recommendations: pd.DataFrame,
    metadata: list[dict],
) -> dict[str, int]:
    """Conta registros das principais tabelas."""
    return {
        "games": len(games),
        "users": len(users),
        "recommendations": len(recommendations),
        "game_metadata": len(metadata),
    }


def descricao_games(games: pd.DataFrame) -> pd.DataFrame:
    """Estatísticas descritivas dos atributos numéricos dos jogos."""
    colunas = [
        "price_final",
        "discount",
        "positive_ratio",
        "user_reviews",
    ]
    colunas = [c for c in colunas if c in games.columns]
    return games[colunas].describe(include="all").T


def qualidade_metadados(metadata: list[dict]) -> dict[str, int]:
    """Quantidade de jogos com descrição e/ou tags preenchidas."""
    total = len(metadata)
    com_descricao = 0
    com_tags = 0

    for rec in metadata:
        descricao = rec.get("description")
        if descricao is not None and str(descricao).strip() != "":
            com_descricao += 1

        tags = rec.get("tags")
        if tags is not None:
            if isinstance(tags, list) and len(tags) > 0:
                com_tags += 1
            elif isinstance(tags, str) and tags.strip() not in ("", "[]"):
                com_tags += 1

    return {"total": total, "com_descricao": com_descricao, "com_tags": com_tags}


def top_tags(metadata: list[dict], limite: int = 15) -> pd.DataFrame:
    """Tags mais frequentes nos metadados."""
    contagem: dict[str, int] = {}

    for rec in metadata:
        tags = rec.get("tags")
        if not tags:
            continue

        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except (json.JSONDecodeError, TypeError):
                tags = [t.strip() for t in tags.split("|") if t.strip()]

        if not isinstance(tags, list):
            continue

        for tag in tags:
            if tag is None:
                continue
            tag = str(tag).strip()
            if not tag:
                continue
            contagem[tag] = contagem.get(tag, 0) + 1

    df = pd.DataFrame(
        sorted(contagem.items(), key=lambda x: x[1], reverse=True)[:limite],
        columns=["tag", "frequencia"],
    )
    return df


def sparsidade_historico(recommendations: pd.DataFrame) -> dict[str, float]:
    """Média e mediana de jogos por usuário no histórico de recomendações."""
    if recommendations.empty:
        return {
            "media_jogos_por_usuario": 0.0,
            "mediana_jogos_por_usuario": 0.0,
            "total_usuarios_com_historico": 0,
        }

    df = (
        recommendations.groupby("user_id")["app_id"]
        .nunique()
        .reset_index(name="n_jogos")
    )

    return {
        "media_jogos_por_usuario": round(float(df["n_jogos"].mean()), 2),
        "mediana_jogos_por_usuario": float(df["n_jogos"].median()),
        "total_usuarios_com_historico": int(len(df)),
    }


def main() -> None:
    linhas: list[str] = []
    linhas.append("=" * 60)
    linhas.append("ANÁLISE EXPLORATÓRIA DE DADOS - DATASET STEAM")
    linhas.append("=" * 60)
    linhas.append("")

    games = _carregar_games()
    users = _carregar_users()
    recommendations = _carregar_recommendations()
    metadata = _carregar_metadata()

    gerais = estatisticas_gerais(games, users, recommendations, metadata)
    linhas.append("1. Registros por tabela:")
    for tabela, quantidade in gerais.items():
        linhas.append(f"   {tabela}: {quantidade:,}")
    linhas.append("")

    linhas.append("2. Estatísticas descritivas dos jogos (numéricos):")
    desc = descricao_games(games)
    for coluna, linha in desc.iterrows():
        valores = " | ".join(
            f"{idx}={val}" for idx, val in linha.items() if pd.notna(val)
        )
        linhas.append(f"   {coluna}: {valores}")
    linhas.append("")

    meta = qualidade_metadados(metadata)
    linhas.append("3. Qualidade dos metadados (game_metadata):")
    linhas.append(f"   Total com metadados: {meta['total']:,}")
    linhas.append(f"   Com descrição preenchida: {meta['com_descricao']:,}")
    linhas.append(f"   Com tags preenchidas: {meta['com_tags']:,}")
    linhas.append("")

    linhas.append(f"4. Top {15} tags mais frequentes:")
    tags = top_tags(metadata, limite=15)
    for _, linha in tags.iterrows():
        linhas.append(f"   {linha['tag']}: {int(linha['frequencia']):,}")
    linhas.append("")

    esparsidade = sparsidade_historico(recommendations)
    linhas.append("5. Sparsidade do histórico de recomendações:")
    linhas.append(f"   Usuários com histórico: {esparsidade['total_usuarios_com_historico']:,}")
    linhas.append(f"   Média de jogos por usuário: {esparsidade['media_jogos_por_usuario']}")
    linhas.append(f"   Mediana de jogos por usuário: {esparsidade['mediana_jogos_por_usuario']}")
    linhas.append("")

    resumo = "\n".join(linhas)
    RESUMO_PATH.write_text(resumo, encoding="utf-8")
    print(resumo)
    print(f"\nResumo salvo em: {RESUMO_PATH}")


if __name__ == "__main__":
    main()

"""Executa a avaliação offline do recomendador com dados reais do Steam.

Execute na raiz de recommender:
    uv run python scripts/evaluate.py --users 100

Os resultados são salvos em results/.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Adiciona a raiz de recommender ao caminho de importação.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import pandas as pd

from src.data.loader import (
    DB_PATH,
    get_connection,
    load_games,
    load_metadata,
    load_recommendations,
)
from src.data.preprocess import build_item_vectors
from src.evaluation.evaluator import (
    coverage,
    evaluate_recommender,
    popularity_baseline,
    random_baseline,
    train_test_split,
)
from src.models.recommender import ContentBasedRecommender


RESULTS_DIR = PROJECT_ROOT / "results"


def sample_users(
    sample_size: int,
    min_interactions: int = 5,
    random_state: int = 42,
    db_path: Path = DB_PATH,
) -> list[int]:
    """Seleciona usuários aleatórios com histórico suficiente.

    Utiliza buscas pontuais pela rowid da tabela users, evitando
    ordenar aleatoriamente milhões de registros.
    """
    rng = np.random.default_rng(random_state)
    selected: set[int] = set()

    with get_connection(db_path) as connection:
        result = connection.execute(
            "SELECT MAX(rowid) FROM users"
        ).fetchone()

        max_rowid = result[0] if result else None

        if not max_rowid:
            raise RuntimeError("A tabela users está vazia.")

        max_attempts = sample_size * 50
        attempts = 0

        while len(selected) < sample_size and attempts < max_attempts:
            attempts += 1

            random_rowid = int(rng.integers(1, max_rowid + 1))

            row = connection.execute(
                """
                SELECT user_id
                FROM users
                WHERE rowid >= ?
                ORDER BY rowid
                LIMIT 1
                """,
                (random_rowid,),
            ).fetchone()

            if row is None:
                continue

            user_id = int(row["user_id"])

            if user_id in selected:
                continue

            count = connection.execute(
                """
                SELECT COUNT(*)
                FROM recommendations
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()[0]

            if count >= min_interactions:
                selected.add(user_id)

    if len(selected) < sample_size:
        print(
            f"Aviso: foram encontrados apenas {len(selected)} "
            f"usuários com pelo menos {min_interactions} interações."
        )

    return sorted(selected)


def load_sample_interactions(
    users: list[int],
    db_path: Path = DB_PATH,
) -> pd.DataFrame:
    """Carrega somente as interações dos usuários selecionados."""
    frames = []

    for user_id in users:
        history = load_recommendations(user_id, db_path)

        if not history.empty:
            frames.append(history)

    if not frames:
        return pd.DataFrame(
            columns=[
                "user_id",
                "app_id",
                "date",
                "hours",
                "is_recommended",
            ]
        )

    return pd.concat(frames, ignore_index=True)


def evaluate(
    sample_size: int,
    random_state: int,
) -> pd.DataFrame:
    """Executa a avaliação completa para uma amostra de usuários."""

    print("1/6 - Selecionando usuários...")
    users = sample_users(
        sample_size=sample_size,
        random_state=random_state,
    )

    if not users:
        raise RuntimeError(
            "Nenhum usuário elegível foi encontrado no banco."
        )

    print(f"Usuários selecionados: {len(users)}")

    print("2/6 - Carregando históricos...")
    interactions = load_sample_interactions(users)

    print(f"Interações carregadas: {len(interactions):,}")

    print("3/6 - Separando treino e teste...")
    train, test = train_test_split(
        interactions,
        test_size=0.2,
        min_interactions=5,
        random_state=random_state,
    )

    print(f"Interações de treino: {len(train):,}")
    print(f"Interações de teste: {len(test):,}")

    print("4/6 - Carregando catálogo e construindo vetores...")
    games = load_games()
    metadata = load_metadata()

    item_matrix, app_ids, features = build_item_vectors(
        games,
        metadata,
    )

    recommender = ContentBasedRecommender(
        item_matrix=item_matrix,
        app_ids=app_ids,
        features=features,
    )

    print(f"Jogos no catálogo: {len(app_ids):,}")
    print(f"Características: {len(features):,}")

    print("5/6 - Avaliando os recomendadores...")
    results = []
    fbc_recommendations: dict[int, list[int]] = {}
    popular_recommendations: dict[int, list[int]] = {}
    random_recommendations: dict[int, list[int]] = {}

    for top_n in (5, 10):
        print(f"  Avaliando Top-{top_n}...")

        fbc_metrics = evaluate_recommender(
            recommender,
            train,
            test,
            users,
            top_n=top_n,
        )

        popular_metrics = popularity_baseline(
            train,
            test,
            users,
            top_n=top_n,
        )

        random_metrics = random_baseline(
            app_ids,
            test,
            users,
            top_n=top_n,
            random_state=random_state,
            train=train,
        )

        for user_id in users:
            fbc_recommendations[user_id] = recommender.recommend(
                user_id,
                train,
                top_n=10,
                exclude_consumed=True,
            )

            consumed = set(
                train.loc[
                    train["user_id"] == user_id,
                    "app_id",
                ].dropna().astype(int)
            )

            # Os candidatos populares são calculados pelo baseline.
            # A cobertura é calculada separadamente para o FBC abaixo.

        results.extend(
            [
                {
                    "model": "FBC",
                    "top_n": top_n,
                    **fbc_metrics,
                },
                {
                    "model": "Popularidade",
                    "top_n": top_n,
                    **popular_metrics,
                },
                {
                    "model": "Aleatorio",
                    "top_n": top_n,
                    **random_metrics,
                },
            ]
        )

    print("6/6 - Calculando cobertura e salvando resultados...")

    fbc_coverage = coverage(
        fbc_recommendations,
        catalog_size=len(app_ids),
    )

    for result in results:
        result["coverage"] = (
            fbc_coverage if result["model"] == "FBC" else np.nan
        )
        result["users_evaluated"] = len(users)
        result["train_interactions"] = len(train)
        result["test_interactions"] = len(test)

    results_df = pd.DataFrame(results)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    output_path = RESULTS_DIR / "evaluation_results.csv"
    results_df.to_csv(
        output_path,
        index=False,
        encoding="utf-8-sig",
    )

    print("\n===== RESULTADOS DA AVALIAÇÃO =====")
    print(
        results_df[
            ["model", "top_n", "precision", "recall", "ndcg", "coverage"]
        ].to_string(index=False)
    )

    print(f"\nArquivo salvo em: {output_path}")

    return results_df


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Avaliação offline do recomendador Steam."
    )

    parser.add_argument(
        "--users",
        type=int,
        default=100,
        help="Quantidade de usuários da amostra (padrão: 100).",
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Semente aleatória (padrão: 42).",
    )

    args = parser.parse_args()

    if args.users < 1:
        parser.error("--users deve ser maior que zero.")

    evaluate(
        sample_size=args.users,
        random_state=args.seed,
    )


if __name__ == "__main__":
    main()

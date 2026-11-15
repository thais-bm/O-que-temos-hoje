
from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


# ============================================================
# CAMINHOS E CONFIGURAÇÕES
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"
DB_PATH = BASE_DIR / "data" / "steam.db"

BATCH_SIZE = 10_000
PROGRESS_INTERVAL = 100_000
ENCODING = "utf-8-sig"


# ============================================================
# ESTRUTURA DO BANCO
# ============================================================

SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    app_id INTEGER PRIMARY KEY,
    title TEXT,
    date_release TEXT,
    win INTEGER,
    mac INTEGER,
    linux INTEGER,
    rating TEXT,
    positive_ratio REAL,
    user_reviews INTEGER,
    price_final REAL,
    price_original REAL,
    discount REAL,
    steam_deck INTEGER
);

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    products INTEGER,
    reviews INTEGER
);

CREATE TABLE IF NOT EXISTS recommendations (
    review_id INTEGER PRIMARY KEY,
    app_id INTEGER,
    user_id INTEGER,
    helpful INTEGER,
    funny INTEGER,
    date TEXT,
    is_recommended INTEGER,
    hours REAL,

    FOREIGN KEY (app_id) REFERENCES games(app_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS game_metadata (
    app_id INTEGER PRIMARY KEY,
    description TEXT,
    tags TEXT,

    FOREIGN KEY (app_id) REFERENCES games(app_id)
);
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS idx_recommendations_app_id
ON recommendations(app_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_id
ON recommendations(user_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_recommended
ON recommendations(user_id, is_recommended);
"""


# ============================================================
# CONFIGURAÇÃO DOS CSVs
# ============================================================

TABLE_CONFIG = {
    "games": {
        "file": "games.csv",
        "columns": [
            "app_id",
            "title",
            "date_release",
            "win",
            "mac",
            "linux",
            "rating",
            "positive_ratio",
            "user_reviews",
            "price_final",
            "price_original",
            "discount",
            "steam_deck",
        ],
        "primary_key": "app_id",
        "types": {
            "app_id": "integer",
            "win": "boolean",
            "mac": "boolean",
            "linux": "boolean",
            "positive_ratio": "real",
            "user_reviews": "integer",
            "price_final": "real",
            "price_original": "real",
            "discount": "real",
            "steam_deck": "boolean",
        },
    },
    "users": {
        "file": "users.csv",
        "columns": [
            "user_id",
            "products",
            "reviews",
        ],
        "primary_key": "user_id",
        "types": {
            "user_id": "integer",
            "products": "integer",
            "reviews": "integer",
        },
    },
    "recommendations": {
        "file": "recommendations.csv",
        "columns": [
            "review_id",
            "app_id",
            "user_id",
            "helpful",
            "funny",
            "date",
            "is_recommended",
            "hours",
        ],
        "primary_key": "review_id",
        "types": {
            "review_id": "integer",
            "app_id": "integer",
            "user_id": "integer",
            "helpful": "integer",
            "funny": "integer",
            "is_recommended": "boolean",
            "hours": "real",
        },
    },
}


# ============================================================
# CONVERSÃO DE VALORES
# ============================================================

def normalize_header(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


def parse_value(value: str | None, data_type: str) -> Any:
    if value is None:
        return None

    value = value.strip()

    if value == "":
        return None

    if data_type == "boolean":
        normalized = value.lower()

        if normalized in ("true", "1", "yes"):
            return 1

        if normalized in ("false", "0", "no"):
            return 0

        raise ValueError(f"Valor booleano inválido: {value}")

    if data_type == "integer":
        return int(float(value))

    if data_type == "real":
        return float(value)

    return value


# ============================================================
# GERAÇÃO DE SQL COM UPSERT
# ============================================================

def build_upsert_sql(
    table_name: str,
    columns: list[str],
    primary_key: str,
) -> str:
    column_names = ", ".join(columns)
    placeholders = ", ".join("?" for _ in columns)

    update_columns = [
        column for column in columns
        if column != primary_key
    ]

    updates = ", ".join(
        f"{column} = excluded.{column}"
        for column in update_columns
    )

    return f"""
        INSERT INTO {table_name} ({column_names})
        VALUES ({placeholders})
        ON CONFLICT({primary_key})
        DO UPDATE SET {updates}
    """


# ============================================================
# IMPORTAÇÃO DOS CSVs
# ============================================================

def import_csv(
    connection: sqlite3.Connection,
    table_name: str,
) -> int:
    config = TABLE_CONFIG[table_name]
    file_path = RAW_DIR / config["file"]

    if not file_path.exists():
        raise FileNotFoundError(
            f"Arquivo não encontrado: {file_path}"
        )

    columns = config["columns"]
    types = config["types"]

    sql = build_upsert_sql(
        table_name,
        columns,
        config["primary_key"],
    )

    print(f"\nImportando {file_path.name} para {table_name}...")

    imported = 0
    batch: list[list[Any]] = []

    with open(
        file_path,
        "r",
        encoding=ENCODING,
        newline="",
    ) as file:
        reader = csv.DictReader(file)

        if not reader.fieldnames:
            raise ValueError(
                f"CSV sem cabeçalho: {file_path}"
            )

        reader.fieldnames = [
            normalize_header(name)
            for name in reader.fieldnames
        ]

        missing = set(columns) - set(reader.fieldnames)

        if missing:
            raise ValueError(
                f"Colunas ausentes em {file_path.name}: "
                f"{sorted(missing)}"
            )

        for line_number, row in enumerate(reader, start=2):
            try:
                values = [
                    parse_value(
                        row.get(column),
                        types.get(column, "text"),
                    )
                    for column in columns
                ]

                batch.append(values)

            except (ValueError, TypeError) as error:
                raise ValueError(
                    f"Erro em {file_path.name}, linha "
                    f"{line_number}: {error}"
                ) from error

            if len(batch) >= BATCH_SIZE:
                with connection:
                    connection.executemany(sql, batch)

                imported += len(batch)
                batch.clear()

                if imported % PROGRESS_INTERVAL == 0:
                    print(f"  {imported:,} registros processados...")

        if batch:
            with connection:
                connection.executemany(sql, batch)

            imported += len(batch)

    print(
        f"Concluído: {imported:,} registros processados "
        f"em {table_name}."
    )

    return imported


# ============================================================
# IMPORTAÇÃO DOS METADADOS JSONL
# ============================================================

def import_metadata(
    connection: sqlite3.Connection,
) -> tuple[int, int]:
    file_path = RAW_DIR / "games_metadata.json"

    if not file_path.exists():
        raise FileNotFoundError(
            f"Arquivo não encontrado: {file_path}"
        )

    print("\nImportando games_metadata.json...")

    sql = """
        INSERT INTO game_metadata (
            app_id,
            description,
            tags
        )
        SELECT ?, ?, ?
        WHERE EXISTS (
            SELECT 1
            FROM games
            WHERE app_id = ?
        )
        ON CONFLICT(app_id)
        DO UPDATE SET
            description = excluded.description,
            tags = excluded.tags
    """

    processed = 0
    imported = 0
    skipped = 0
    batch: list[tuple[Any, ...]] = []

    def save_batch(items: list[tuple[Any, ...]]) -> int:
        before = connection.total_changes

        with connection:
            connection.executemany(sql, items)

        return connection.total_changes - before

    with open(
        file_path,
        "r",
        encoding=ENCODING,
    ) as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue

            try:
                game = json.loads(line)

                app_id = int(game["app_id"])
                description = game.get("description")

                tags = json.dumps(
                    game.get("tags", []),
                    ensure_ascii=False,
                )

                batch.append(
                    (
                        app_id,
                        description,
                        tags,
                        app_id,
                    )
                )

            except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
                raise ValueError(
                    f"Erro no JSON na linha {line_number}: {error}"
                ) from error

            processed += 1

            if len(batch) >= BATCH_SIZE:
                inserted = save_batch(batch)

                imported += inserted
                skipped += len(batch) - inserted

                batch.clear()

                if processed % PROGRESS_INTERVAL == 0:
                    print(
                        f"  {processed:,} metadados processados..."
                    )

        if batch:
            inserted = save_batch(batch)

            imported += inserted
            skipped += len(batch) - inserted

    print(f"Metadados processados: {processed:,}")
    print(f"Metadados associados a jogos: {imported:,}")
    print(f"Metadados sem jogo correspondente: {skipped:,}")

    return imported, skipped


# ============================================================
# ÍNDICES E ESTATÍSTICAS
# ============================================================

def create_indexes(connection: sqlite3.Connection) -> None:
    print("\nCriando índices...")

    with connection:
        connection.executescript(INDEXES)

    print("Índices criados.")


def show_statistics(connection: sqlite3.Connection) -> None:
    print("\n" + "=" * 55)
    print("ESTATÍSTICAS DO BANCO STEAM")
    print("=" * 55)

    tables = [
        "games",
        "users",
        "recommendations",
        "game_metadata",
    ]

    for table in tables:
        count = connection.execute(
            f"SELECT COUNT(*) FROM {table}"
        ).fetchone()[0]

        print(f"{table}: {count:,} registros")

    print("\nVerificando integridade referencial...")

    foreign_key_count = connection.execute(
        "SELECT COUNT(*) FROM pragma_foreign_key_check"
    ).fetchone()[0]

    if foreign_key_count == 0:
        print("Integridade referencial: OK")
    else:
        errors = connection.execute(
            "PRAGMA foreign_key_check"
        ).fetchmany(20)

        print(
            f"ATENÇÃO: {foreign_key_count:,} violações de "
            "chaves estrangeiras."
        )
        print("Primeiras ocorrências:")

        for error in errors:
            print(error)

        raise RuntimeError(
            "O banco foi importado, mas existem violações "
            "de integridade referencial. Consulte as ocorrências."
        )

    print("=" * 55)


# ============================================================
# EXECUÇÃO PRINCIPAL
# ============================================================

def main() -> None:
    print("=" * 55)
    print("IMPORTAÇÃO DO DATASET STEAM PARA SQLITE")
    print("=" * 55)

    required_files = [
        RAW_DIR / "games.csv",
        RAW_DIR / "users.csv",
        RAW_DIR / "recommendations.csv",
        RAW_DIR / "games_metadata.json",
    ]

    for file_path in required_files:
        if not file_path.exists():
            raise FileNotFoundError(
                f"Arquivo obrigatório não encontrado: {file_path}"
            )

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    print(f"\nPasta dos dados: {RAW_DIR}")
    print(f"Banco de destino: {DB_PATH}")

    connection = sqlite3.connect(DB_PATH)

    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.execute("PRAGMA temp_store = MEMORY")
        connection.execute("PRAGMA cache_size = -64000")

        connection.executescript(SCHEMA)

        # A ordem respeita as chaves estrangeiras.
        import_csv(connection, "games")
        import_csv(connection, "users")
        import_csv(connection, "recommendations")
        import_metadata(connection)

        create_indexes(connection)

        # Garante que todas as alterações estejam gravadas.
        connection.commit()

        show_statistics(connection)

        print("\nIMPORTAÇÃO CONCLUÍDA!")
        print(f"Banco criado em: {DB_PATH}")

    except Exception:
        connection.rollback()
        print("\nA importação foi interrompida por um erro.")
        print(
            "Os lotes já confirmados continuam no banco. "
            "Corrija o problema e execute novamente."
        )
        raise

    finally:
        connection.close()


if __name__ == "__main__":
    main()

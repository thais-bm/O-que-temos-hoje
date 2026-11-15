from __future__ import annotations

import gc
import sqlite3
import time
from pathlib import Path

import duckdb


# ============================================================
# CAMINHOS E CONFIGURAÇÕES
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw"
DB_PATH = BASE_DIR / "data" / "steam.db"


# ============================================================
# ESTRUTURA DO BANCO (SQLITE)
# ============================================================

SCHEMA = """
CREATE TABLE games (
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

CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    products INTEGER,
    reviews INTEGER
);

CREATE TABLE recommendations (
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

CREATE TABLE game_metadata (
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
# FUNÇÃO AUXILIAR PARA LIMPEZA SEGURA NO WINDOWS
# ============================================================

def cleanup_db_files() -> None:
    """Remove o banco e arquivos temporários garantindo que não haja lock no Windows."""
    gc.collect()
    for suffix in ("", "-wal", "-shm", "-journal"):
        f = DB_PATH.with_name(DB_PATH.name + suffix)
        if f.exists():
            try:
                f.unlink()
            except PermissionError:
                time.sleep(0.5)
                try:
                    f.unlink()
                except PermissionError:
                    print(f"[AVISO] Não foi possível remover {f.name} (arquivo em uso).")


# ============================================================
# ETAPA 1: CRIAR ESTRUTURA VAZIA DO SQLITE
# ============================================================

def init_sqlite_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    cleanup_db_files()

    conn = sqlite3.connect(DB_PATH)
    try:
        # Page size de 64KB + WAL ficam gravados no cabeçalho do arquivo .db
        # Assim, quando o DuckDB abrir o arquivo, já estará em modo de alta performance!
        conn.execute("PRAGMA page_size = 65536")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


# ============================================================
# ETAPA 2: CARGA DIRETA COM DUCKDB
# ============================================================

def bulk_load_with_duckdb() -> None:
    games_csv = (RAW_DIR / "games.csv").as_posix()
    users_csv = (RAW_DIR / "users.csv").as_posix()
    recs_csv = (RAW_DIR / "recommendations.csv").as_posix()
    meta_json = (RAW_DIR / "games_metadata.json").as_posix()
    db_file = DB_PATH.as_posix()

    duck_conn = duckdb.connect()
    attached = False

    try:
        print("\nInicializando extensão SQLite no DuckDB...")
        duck_conn.execute("INSTALL sqlite; LOAD sqlite;")
        duck_conn.execute(f"ATTACH '{db_file}' AS steam_db (TYPE SQLITE);")
        attached = True

        # 1. GAMES
        t0 = time.perf_counter()
        print("\n[1/4] Importando games.csv...")
        duck_conn.execute(f"""
            INSERT INTO steam_db.games
            SELECT
                CAST(app_id AS BIGINT),
                NULLIF(TRIM(title), ''),
                NULLIF(TRIM(CAST(date_release AS VARCHAR)), ''),
                CASE WHEN LOWER(TRIM(CAST(win AS VARCHAR))) IN ('true', '1', 'yes') THEN 1 ELSE 0 END,
                CASE WHEN LOWER(TRIM(CAST(mac AS VARCHAR))) IN ('true', '1', 'yes') THEN 1 ELSE 0 END,
                CASE WHEN LOWER(TRIM(CAST(linux AS VARCHAR))) IN ('true', '1', 'yes') THEN 1 ELSE 0 END,
                NULLIF(TRIM(rating), ''),
                CAST(positive_ratio AS DOUBLE),
                CAST(user_reviews AS BIGINT),
                CAST(price_final AS DOUBLE),
                CAST(price_original AS DOUBLE),
                CAST(discount AS DOUBLE),
                CASE WHEN LOWER(TRIM(CAST(steam_deck AS VARCHAR))) IN ('true', '1', 'yes') THEN 1 ELSE 0 END
            FROM read_csv('{games_csv}', header=true, null_padding=true)
        """)
        print(f"  Concluído em {time.perf_counter() - t0:.2f}s")

        # 2. USERS
        t0 = time.perf_counter()
        print("\n[2/4] Importando users.csv...")
        duck_conn.execute(f"""
            INSERT INTO steam_db.users
            SELECT
                CAST(user_id AS BIGINT),
                CAST(products AS BIGINT),
                CAST(reviews AS BIGINT)
            FROM read_csv('{users_csv}', header=true)
        """)
        print(f"  Concluído em {time.perf_counter() - t0:.2f}s")

        # 3. RECOMMENDATIONS (40+ milhões de linhas)
        t0 = time.perf_counter()
        print("\n[3/4] Importando recommendations.csv (40M+ registros)...")
        duck_conn.execute(f"""
            INSERT INTO steam_db.recommendations
            SELECT
                CAST(review_id AS BIGINT),
                CAST(app_id AS BIGINT),
                CAST(user_id AS BIGINT),
                CAST(helpful AS BIGINT),
                CAST(funny AS BIGINT),
                NULLIF(TRIM(CAST("date" AS VARCHAR)), ''),
                CASE WHEN LOWER(TRIM(CAST(is_recommended AS VARCHAR))) IN ('true', '1', 'yes') THEN 1 ELSE 0 END,
                CAST("hours" AS DOUBLE)
            FROM read_csv('{recs_csv}', header=true)
        """)
        print(f"  Concluído em {time.perf_counter() - t0:.2f}s")

        # 4. METADATA (JSONL)
        t0 = time.perf_counter()
        print("\n[4/4] Importando games_metadata.json...")
        duck_conn.execute(f"""
            INSERT INTO steam_db.game_metadata
            SELECT
                CAST(m.app_id AS BIGINT),
                NULLIF(TRIM(m.description), ''),
                CAST(to_json(COALESCE(m.tags, [])) AS VARCHAR)
            FROM read_json(
                '{meta_json}',
                format='newline_delimited',
                columns={{'app_id': 'BIGINT', 'description': 'VARCHAR', 'tags': 'VARCHAR[]'}}
            ) m
            INNER JOIN steam_db.games g ON CAST(m.app_id AS BIGINT) = g.app_id
        """)
        print(f"  Concluído em {time.perf_counter() - t0:.2f}s")

    finally:
        # Libera o lock do arquivo no Windows antes de fechar a conexão
        if attached:
            try:
                duck_conn.execute("DETACH steam_db;")
            except Exception:
                pass
        duck_conn.close()


# ============================================================
# ETAPA 3: ÍNDICES E ESTATÍSTICAS
# ============================================================

def finalize_and_verify() -> None:
    connection = sqlite3.connect(DB_PATH)
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.execute("PRAGMA temp_store = MEMORY")
        connection.execute("PRAGMA cache_size = -512000")  # ~512MB RAM
        connection.execute("PRAGMA mmap_size = 30000000000")

        t0 = time.perf_counter()
        print("\nCriando índices no SQLite...")
        with connection:
            connection.executescript(INDEXES)
        print(f"Índices criados em {time.perf_counter() - t0:.2f}s.")

        print("\n" + "=" * 55)
        print("ESTATÍSTICAS DO BANCO STEAM")
        print("=" * 55)

        for table in ("games", "users", "recommendations", "game_metadata"):
            count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"{table}: {count:,} registros")

        print("\nVerificando integridade referencial...")
        foreign_key_count = connection.execute(
            "SELECT COUNT(*) FROM pragma_foreign_key_check"
        ).fetchone()[0]

        if foreign_key_count == 0:
            print("Integridade referencial: OK")
        else:
            errors = connection.execute("PRAGMA foreign_key_check").fetchmany(20)
            print(f"ATENÇÃO: {foreign_key_count:,} violações de chaves estrangeiras.")
            for error in errors:
                print(error)
            raise RuntimeError("Violações de integridade referencial encontradas.")

        # Faz um checkpoint do WAL para consolidar tudo no arquivo steam.db principal
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        print("=" * 55)

    finally:
        connection.close()


# ============================================================
# EXECUÇÃO PRINCIPAL
# ============================================================

def main() -> None:
    total_start = time.perf_counter()
    print("=" * 55)
    print("IMPORTAÇÃO STEAM PARA SQLITE VIA DUCKDB (CRIAÇÃO DO ZERO)")
    print("=" * 55)

    required_files = [
        RAW_DIR / "games.csv",
        RAW_DIR / "users.csv",
        RAW_DIR / "recommendations.csv",
        RAW_DIR / "games_metadata.json",
    ]

    for file_path in required_files:
        if not file_path.exists():
            raise FileNotFoundError(f"Arquivo obrigatório não encontrado: {file_path}")

    try:
        init_sqlite_db()
        bulk_load_with_duckdb()
        finalize_and_verify()

        total_time = time.perf_counter() - total_start
        print(f"\nIMPORTAÇÃO CONCLUÍDA EM {total_time:.2f} SEGUNDOS!")
        print(f"Banco disponível em: {DB_PATH}")

    except Exception as err:
        print(f"\n[ERRO] Falha ao importar o banco de dados SQLite: {err}")
        cleanup_db_files()
        raise


if __name__ == "__main__":
    main()
"""Script unificado para inicializar o banco SQLite (se necessário),
o backend FastAPI e o frontend React (Vite) simultaneamente.

Execute a partir da raiz do repositório:
    python scripts/start_app.py
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "steam.db"
IMPORT_SCRIPT = BASE_DIR / "scripts" / "import_steam_db.py"
RECOMMENDER_DIR = BASE_DIR / "recommender"
FRONTEND_DIR = BASE_DIR / "frontend"

REQUIRED_RAW_FILES = (
    "games.csv",
    "users.csv",
    "recommendations.csv",
    "games_metadata.json",
)


def _stream_output(pipe, prefix: str) -> None:
    """Lê a saída de um processo e imprime com prefixo identificador."""
    try:
        for line in iter(pipe.readline, ""):
            if not line:
                break
            print(f"{prefix} {line}", end="", flush=True)
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except Exception:
            pass


def _kill_process_tree(proc: subprocess.Popen) -> None:
    """Encerra um processo e todos os seus subprocessos (compatível com Windows e Unix)."""
    if proc.poll() is not None:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except ProcessLookupError:
            pass


def ensure_database(skip_db_check: bool = False) -> None:
    """Garante que data/steam.db exista antes de subir o backend."""
    if skip_db_check:
        return

    if DB_PATH.exists() and DB_PATH.stat().st_size > 0:
        print(f"[SETUP] Banco SQLite encontrado em: {DB_PATH}")
        return

    print(f"[SETUP] Banco SQLite não encontrado em {DB_PATH}.")
    missing = [name for name in REQUIRED_RAW_FILES if not (RAW_DIR / name).exists()]
    if missing:
        print(
            "[ERRO] Não foi possível criar o banco automaticamente porque faltam "
            f"arquivos em {RAW_DIR}: {', '.join(missing)}",
            file=sys.stderr,
        )
        sys.exit(1)

    print("[SETUP] Executando importação inicial dos dados para o SQLite...")
    print("[SETUP] (Isso ocorre apenas na primeira execução e pode levar alguns minutos)")
    result = subprocess.run(
        [sys.executable, str(IMPORT_SCRIPT)],
        cwd=str(BASE_DIR),
        check=False,
    )
    if result.returncode != 0:
        print("[ERRO] Falha ao importar o banco de dados SQLite.", file=sys.stderr)
        sys.exit(result.returncode)


def ensure_frontend_deps(npm_cmd: str) -> None:
    """Instala dependências do frontend caso node_modules não exista."""
    node_modules = FRONTEND_DIR / "node_modules"
    if node_modules.exists():
        return

    print("[SETUP] node_modules não encontrado em frontend/. Executando 'npm install'...")
    result = subprocess.run(
        [npm_cmd, "install"],
        cwd=str(FRONTEND_DIR),
        check=False,
    )
    if result.returncode != 0:
        print("[ERRO] Falha ao instalar dependências do frontend (npm install).", file=sys.stderr)
        sys.exit(result.returncode)


def resolve_backend_cmd(port: int, reload_enabled: bool) -> list[str]:
    """Determina o comando para iniciar o FastAPI (uv ou venv/python)."""
    uvicorn_args = [
        "src.api.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
    ]
    if reload_enabled:
        uvicorn_args.append("--reload")

    uv_bin = shutil.which("uv")
    if uv_bin:
        return [uv_bin, "run", "uvicorn", *uvicorn_args]

    venv_python = (
        RECOMMENDER_DIR / ".venv" / "Scripts" / "python.exe"
        if os.name == "nt"
        else RECOMMENDER_DIR / ".venv" / "bin" / "python"
    )
    if venv_python.exists():
        return [str(venv_python), "-m", "uvicorn", *uvicorn_args]

    return [sys.executable, "-m", "uvicorn", *uvicorn_args]


def resolve_npm_cmd() -> str:
    """Localiza o executável do npm no sistema."""
    npm_bin = shutil.which("npm.cmd" if os.name == "nt" else "npm") or shutil.which("npm")
    if not npm_bin:
        print(
            "[ERRO] 'npm' não encontrado no PATH. Instale o Node.js para rodar o frontend.",
            file=sys.stderr,
        )
        sys.exit(1)
    return npm_bin


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inicializa o backend FastAPI e o frontend React simultaneamente."
    )
    parser.add_argument(
        "--backend-port",
        type=int,
        default=8000,
        help="Porta do servidor FastAPI (padrão: 8000).",
    )
    parser.add_argument(
        "--frontend-port",
        type=int,
        default=5173,
        help="Porta do servidor Vite/React (padrão: 5173).",
    )
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Desativa o --reload do uvicorn para economizar memória.",
    )
    parser.add_argument(
        "--skip-db-check",
        action="store_true",
        help="Pula a verificação/importação automática do data/steam.db.",
    )
    args = parser.parse_args()

    ensure_database(skip_db_check=args.skip_db_check)
    npm_cmd = resolve_npm_cmd()
    ensure_frontend_deps(npm_cmd)

    backend_cmd = resolve_backend_cmd(
        port=args.backend_port,
        reload_enabled=not args.no_reload,
    )
    frontend_cmd = [
        npm_cmd,
        "run",
        "dev",
        "--",
        "--port",
        str(args.frontend_port),
    ]

    print("=" * 65)
    print(" Iniciando O Que Temos Hoje? (Backend FastAPI + Frontend React)")
    print(f" -> Backend API : http://localhost:{args.backend_port}")
    print(f" -> Swagger Docs: http://localhost:{args.backend_port}/docs")
    print(f" -> Frontend UI : http://localhost:{args.frontend_port}")
    print(" Pressione Ctrl+C para encerrar ambos os servidores.")
    print("=" * 65)

    popen_kwargs: dict = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
        "bufsize": 1,
    }
    if os.name != "nt":
        popen_kwargs["preexec_fn"] = os.setsid

    env_frontend = os.environ.copy()
    env_frontend.setdefault("VITE_API_URL", f"http://localhost:{args.backend_port}")

    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=str(RECOMMENDER_DIR),
        **popen_kwargs,
    )
    frontend_proc = subprocess.Popen(
        frontend_cmd,
        cwd=str(FRONTEND_DIR),
        env=env_frontend,
        **popen_kwargs,
    )

    threads = [
        threading.Thread(
            target=_stream_output,
            args=(backend_proc.stdout, "[BACKEND ]"),
            daemon=True,
        ),
        threading.Thread(
            target=_stream_output,
            args=(frontend_proc.stdout, "[FRONTEND]"),
            daemon=True,
        ),
    ]
    for thread in threads:
        thread.start()

    try:
        while True:
            backend_code = backend_proc.poll()
            frontend_code = frontend_proc.poll()

            if backend_code is not None:
                print(f"\n[AVISO] O processo do backend encerrou (código {backend_code}).")
                break

            if frontend_code is not None:
                print(f"\n[AVISO] O processo do frontend encerrou (código {frontend_code}).")
                break

            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[INFO] Encerrando backend e frontend...")
    finally:
        _kill_process_tree(frontend_proc)
        _kill_process_tree(backend_proc)
        print("[INFO] Servidores finalizados.")


if __name__ == "__main__":
    main()

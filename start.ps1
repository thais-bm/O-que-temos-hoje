# Inicializa o banco SQLite (se necessário), o backend FastAPI e o frontend React.
# Uso: .\start.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

python "$ScriptDir\scripts\start_app.py" @args

# 單一 port 模式：建置前端後由 Flask 同時提供 API 與網頁
# 開 http://127.0.0.1:5000 即可
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $root '.venv\Scripts\python.exe'

Write-Host "[1/3] 建置前端 ..." -ForegroundColor Cyan
Push-Location (Join-Path $root 'frontend')
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Pop-Location

Write-Host "[2/3] 套用資料庫遷移 ..." -ForegroundColor Cyan
Push-Location (Join-Path $root 'backend')
& $venv -m flask --app wsgi:app db upgrade
Pop-Location

Write-Host "[3/3] 啟動伺服器 http://127.0.0.1:5000 ..." -ForegroundColor Cyan
$env:SERVE_FRONTEND = '1'
Push-Location (Join-Path $root 'backend')
& $venv -m flask --app wsgi:app run --port 5000
Pop-Location

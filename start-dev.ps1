# 開發模式：後端 (5000) + 前端 dev server (5173)
# 前端已設定 proxy，開 http://127.0.0.1:5173 即可
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $root '.venv\Scripts\python.exe'

if (-not (Test-Path $venv)) {
    Write-Host "找不到虛擬環境，請先執行：uv venv .venv --python 3.12" -ForegroundColor Red
    exit 1
}

Write-Host "[1/2] 啟動後端 http://127.0.0.1:5000 ..." -ForegroundColor Cyan
Start-Process -FilePath $venv `
    -ArgumentList '-m', 'flask', '--app', 'wsgi:app', 'run', '--port', '5000', '--debug' `
    -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Minimized

Write-Host "[2/2] 啟動前端 http://127.0.0.1:5173 ..." -ForegroundColor Cyan
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' `
    -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Minimized

Start-Sleep -Seconds 4
Write-Host ""
Write-Host "完成。請開啟 http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "登入帳號：warehouse1 / purchase1 / admin1，密碼 demo1234" -ForegroundColor Green

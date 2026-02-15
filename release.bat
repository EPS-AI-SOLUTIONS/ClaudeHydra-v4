@echo off
setlocal

echo === ClaudeHydra v4 Release ===

:: ── 1. OAuth Router (port 3001) ─────────────────────────────────────
netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo [START] OAuth router on port 3001...
    start /B "" npx anthropic-max-router --port 3001 --quiet
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] OAuth router already running on port 3001
)

:: ── 2. Backend (port 8082) ──────────────────────────────────────────
netstat -ano | findstr ":8082 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo [START] Backend on port 8082...
    set DATABASE_URL=postgres://claude:claude_local@localhost:5433/claudehydra
    start /B "" "%~dp0backend\target\release\claudehydra-backend.exe"
    timeout /t 2 /nobreak >nul
) else (
    echo [OK] Backend already running on port 8082
)

:: ── 3. Build + Preview ──────────────────────────────────────────────
echo [BUILD] Building frontend...
call pnpm build
echo [PREVIEW] Starting preview on port 5199...
call pnpm preview

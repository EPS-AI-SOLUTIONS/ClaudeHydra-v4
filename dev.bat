@echo off
echo === ClaudeHydra v4 DEV ===

:: Kill old backend on port 8082
echo [RESTART] Stopping old backend on port 8082...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8082 " ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start new backend
echo [START] Backend (cargo run)...
start "ClaudeHydra Backend" /min cmd /c "cd /d %~dp0backend && cargo run"

:: Open Chrome after delay
start /b cmd /c "timeout /t 5 /nobreak >nul && start chrome --new-window http://localhost:5199"

:: Start frontend dev server
echo [DEV] Starting frontend dev server...
pnpm dev

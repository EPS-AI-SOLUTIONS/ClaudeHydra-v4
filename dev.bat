@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "LIB=C:\Users\BIURODOM\Desktop\ClaudeDesktop\jaskier-lib.bat"

:: Init colors
call "%LIB%" :init_colors
:: Kill previous instances
taskkill /F /FI "WINDOWTITLE eq [Jaskier] ClaudeHydra*" >nul 2>&1
powershell -NoProfile -Command "Get-Process | Where-Object { $_.Name -eq 'powershell' -and $_.CommandLine -like '*tray-minimizer.ps1*' -and $_.CommandLine -like '*ClaudeHydra DEV*' } | Stop-Process -Force -ErrorAction SilentlyContinue" >nul 2>&1
title [Jaskier] ClaudeHydra v4 DEV
echo !BOLD!!MAGENTA!=== ClaudeHydra v4 DEV ===!RESET!

:: Log init
call "%LIB%" :log_init "claudehydra" "dev"

:: Validate .env
call "%LIB%" :env_check "%~dp0.env" "GOOGLE_API_KEY ANTHROPIC_API_KEY"
call "%LIB%" :env_check "%~dp0backend\.env" "DATABASE_URL GOOGLE_API_KEY ANTHROPIC_API_KEY"

:: Docker DB check
call "%LIB%" :docker_db_check "claudehydra-db-1" "%~dp0backend"

:: Kill old processes (graceful)
call "%LIB%" :kill_port 8082 "backend"
call "%LIB%" :kill_port 5199 "frontend dev"

:: Partner check
call "%LIB%" :partner_check 8081 "GeminiHydra"

:: Browser proxy (needed for image generation)
call "%LIB%" :proxy_ensure

:: Start backend
echo !CYAN![START]!RESET! Backend ^(cargo run^)...
start "[Jaskier] ClaudeHydra Backend" /min cmd /c "cd /d %~dp0backend && cargo run"

:: Health check
call "%LIB%" :health_check 8082 30

:: Port validation
call "%LIB%" :port_validate 8082 5

:: Open Chrome in app mode
start "" chrome --app=http://localhost:5199

:: Toast notification
call "%LIB%" :toast "ClaudeHydra v4" "DEV server starting on port 5199"

:: Start frontend dev server
echo !CYAN![DEV]!RESET! Starting frontend dev server on port 5199...
echo !YELLOW!Hiding to tray... Check the system tray icon to restore or stop.!RESET!
start "" /B powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\BIURODOM\Desktop\ClaudeDesktop\tray-minimizer.ps1" -AppTitle "ClaudeHydra DEV" -IconPath "C:\Users\BIURODOM\Desktop\ClaudeDesktop\.jaskier-icons\claudehydra.ico" -KillExe "claudehydra-backend" -KillTitle "[Jaskier] ClaudeHydra"
endlocal && cd /d "%~dp0" && pnpm run dev

@echo off
REM ============================================================
REM  GNC System Launcher
REM  Starts both the C++ Drogon backend and the React Vite frontend
REM  Usage:  run_system.bat
REM ============================================================

title GNC System Launcher

set "PROJECT_ROOT=%~dp0"
set "BACKEND_EXE=%PROJECT_ROOT%gnc-backend\build\Release\gnc-backend.exe"
set "BACKEND_CONFIG=%PROJECT_ROOT%gnc-backend\config\dev.json"
set "FRONTEND_DIR=%PROJECT_ROOT%gnc-frontend"

REM --- Verify backend executable exists ---
if not exist "%BACKEND_EXE%" (
    echo [ERROR] Backend executable not found at:
    echo         %BACKEND_EXE%
    echo         Please build the backend first.
    pause
    exit /b 1
)

REM --- Ensure logs directory exists ---
if not exist "%PROJECT_ROOT%gnc-backend\build\Release\logs" mkdir "%PROJECT_ROOT%gnc-backend\build\Release\logs"

REM --- Start Backend (port 8080) ---
echo [GNC] Starting Drogon backend on port 8080 ...
start "GNC-Backend" /D "%PROJECT_ROOT%gnc-backend\build\Release" cmd /c "gnc-backend.exe ..\..\config\dev.json"

REM --- Give the backend a moment to initialise ---
timeout /t 3 /nobreak >nul

REM --- Start Frontend (port 5173) ---
echo [GNC] Starting React Vite frontend on port 5173 ...
start "GNC-Frontend" /D "%FRONTEND_DIR%" cmd /c "npm run dev"

echo.
echo ============================================================
echo   GNC System is starting:
echo     Backend  : http://localhost:8080
echo     Frontend : http://localhost:5173
echo ============================================================
echo.
echo Close the "GNC-Backend" and "GNC-Frontend" windows to stop.

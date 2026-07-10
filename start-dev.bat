@echo off
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%~1"=="" exit /b %EXIT_CODE%
echo.
pause
exit /b %EXIT_CODE%

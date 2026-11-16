@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0KURULUM.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo Kurulum tamamlanmadi. Hata: %RC%
pause
exit /b %RC%

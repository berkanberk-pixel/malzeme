@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0AG_BAGLANTI_TEST.ps1"
echo.
pause

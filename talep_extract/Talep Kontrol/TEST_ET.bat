@echo off
setlocal EnableExtensions
cd /d "%~dp0" 2>nul
title YEDAS Talep Kontrol - Servis ve Python Teshis
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [HATA] Windows PowerShell bulunamadi.
  pause
  exit /b 91
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0TEST_ET.ps1"
echo.
pause

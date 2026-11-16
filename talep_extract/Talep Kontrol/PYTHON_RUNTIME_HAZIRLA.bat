@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title YEDAS Talep Kontrol - Python Runtime Hazirla
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [HATA] Windows PowerShell bulunamadi.
  pause
  exit /b 91
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0POWERSHELL_KONTROL.ps1" -Target "%~dp0PYTHON_BOOTSTRAP.ps1" -Quiet
set "PARSER_RC=%ERRORLEVEL%"
if not "%PARSER_RC%"=="0" (
  echo [HATA] PYTHON_BOOTSTRAP.ps1 parser kontrolu basarisiz. Kod: %PARSER_RC%
  pause
  exit /b %PARSER_RC%
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0PYTHON_BOOTSTRAP.ps1" -PrepareOnly
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] Tasinabilir Python hazir.
) else (
  echo [HATA] Runtime hazirlanamadi. Kod: %RC%
  echo Log: %TEMP%\YEDAS_TalepKontrol_PYTHON_INSTALL.log
)
pause
exit /b %RC%

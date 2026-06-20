@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title Malzeme Stok Takip - Kurulum
color 0B

set "ROOT=%~dp0"
cd /d "%ROOT%"
set "VENV_PY=%ROOT%.venv\Scripts\python.exe"
set "LOG=%ROOT%kurulum.log"

echo.
echo  ============================================
echo    ILK KURULUM
echo  ============================================
echo.

set "PY_CMD="
where python >nul 2>&1 && set "PY_CMD=python"
if not defined PY_CMD (
    where py >nul 2>&1 && set "PY_CMD=py -3"
)
if not defined PY_CMD (
    echo  [HATA] Python bulunamadi!
    pause
    exit /b 1
)

if not exist "%ROOT%Database2.accdb" (
    echo  [HATA] Database2.accdb bu klasorde yok!
    echo  Konum: %ROOT%
    pause
    exit /b 1
)

echo  [1/4] Sanal ortam...
if exist "%ROOT%.venv" rmdir /s /q "%ROOT%.venv"
%PY_CMD% -m venv "%ROOT%.venv"
if not exist "%VENV_PY%" (
    echo  [HATA] venv olusturulamadi!
    pause
    exit /b 1
)

echo  [2/4] Paketler...
"%VENV_PY%" -m pip install --upgrade pip
"%VENV_PY%" -m pip install -r "%ROOT%requirements.txt"
if !errorlevel! neq 0 (
    echo  [HATA] pip basarisiz!
    pause
    exit /b 1
)

echo  [3/4] Veritabani...
if not exist "%ROOT%data" mkdir "%ROOT%data"
if exist "%ROOT%data\malzeme.db" del "%ROOT%data\malzeme.db"
set "ACCDB_PATH=%ROOT%Database2.accdb"
set "DB_PATH=%ROOT%data\malzeme.db"
"%VENV_PY%" "%ROOT%scripts\import_access.py" > "%LOG%" 2>&1
if !errorlevel! neq 0 (
    echo  [HATA] Veri aktarimi basarisiz! Log: %LOG%
    type "%LOG%"
    pause
    exit /b 1
)

echo  [4/4] Kurulum tamamlandi!
echo.
echo  Simdi baslat.bat dosyasina cift tiklayin.
echo.
pause

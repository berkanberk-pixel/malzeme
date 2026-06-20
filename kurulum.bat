@echo off
chcp 65001 >nul
title Malzeme Stok Takip - Kurulum
color 0B

cd /d "%~dp0"

echo.
echo  ============================================
echo    ILK KURULUM
echo  ============================================
echo.

where python >nul 2>&1
if %errorlevel% neq 0 (
    where py >nul 2>&1
    if %errorlevel% neq 0 (
        echo  Python bulunamadi. Once Python 3 kurun.
        pause
        exit /b 1
    )
    set PYTHON=py -3
) else (
    set PYTHON=python
)

if not exist "Database2.accdb" (
    echo  [HATA] Database2.accdb bu klasorde yok!
    echo  Dosyayi su konuma kopyalayin: %~dp0
    pause
    exit /b 1
)

echo  [1/4] Sanal ortam olusturuluyor...
%PYTHON% -m venv .venv
call .venv\Scripts\activate.bat

echo  [2/4] Paketler kuruluyor...
pip install -r requirements.txt

echo  [3/4] Veritabani olusturuluyor...
if exist "data\malzeme.db" del "data\malzeme.db"
set ACCDB_PATH=%~dp0Database2.accdb
set DB_PATH=%~dp0data\malzeme.db
%PYTHON% scripts\import_access.py

echo  [4/4] Kurulum tamamlandi!
echo.
echo  Uygulamayi baslatmak icin baslat.bat dosyasina cift tiklayin.
echo.
pause

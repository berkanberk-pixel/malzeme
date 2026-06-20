@echo off
chcp 65001 >nul
title Malzeme Stok Takip Sistemi
color 0A

cd /d "%~dp0"

echo.
echo  ============================================
echo    MALZEME STOK TAKIP SISTEMI
echo  ============================================
echo.

:: Python kontrolu
where python >nul 2>&1
if %errorlevel% neq 0 (
    where py >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [HATA] Python bulunamadi!
        echo.
        echo  Python 3 kurun: https://www.python.org/downloads/
        echo  Kurulumda "Add Python to PATH" secenegini isaretleyin.
        echo.
        pause
        exit /b 1
    )
    set PYTHON=py -3
) else (
    set PYTHON=python
)

echo  [OK] Python bulundu
%PYTHON% --version

:: Database2.accdb kontrolu
if not exist "Database2.accdb" (
    echo.
    echo  [HATA] Database2.accdb dosyasi bulunamadi!
    echo.
    echo  Bu dosyayi su klasore kopyalayin:
    echo  %~dp0
    echo.
    pause
    exit /b 1
)
echo  [OK] Database2.accdb bulundu

:: Paket kurulumu (ilk calistirmada)
if not exist ".venv" (
    echo.
    echo  [..] Sanal ortam olusturuluyor...
    %PYTHON% -m venv .venv
    if %errorlevel% neq 0 (
        echo  [HATA] Sanal ortam olusturulamadi!
        pause
        exit /b 1
    )
)

echo  [..] Paketler kontrol ediliyor...
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo  [HATA] Paket kurulumu basarisiz!
    pause
    exit /b 1
)
echo  [OK] Paketler hazir

:: Veritabani kontrolu
if not exist "data\malzeme.db" (
    echo.
    echo  [..] Access verisi aktariliyor (ilk kurulum)...
    set ACCDB_PATH=%~dp0Database2.accdb
    set DB_PATH=%~dp0data\malzeme.db
    %PYTHON% scripts\import_access.py
    if %errorlevel% neq 0 (
        echo  [HATA] Veri aktarimi basarisiz!
        pause
        exit /b 1
    )
    echo  [OK] Veri aktarimi tamamlandi
)

:: Uygulamayi baslat
echo.
echo  ============================================
echo    Uygulama baslatiliyor...
echo    Tarayici: http://localhost:5000
echo.
echo    Kapatmak icin bu pencereyi kapatin
echo    veya Ctrl+C basin
echo  ============================================
echo.

:: Tarayiciyi 2 saniye sonra ac
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5000"

set DB_PATH=%~dp0data\malzeme.db
%PYTHON% run.py

pause

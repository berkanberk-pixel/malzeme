@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title Malzeme Stok Takip Sistemi
color 0A

:: Proje klasoru (turkce karakter ve bosluk destekli)
set "ROOT=%~dp0"
cd /d "%ROOT%"

set "VENV_PY=%ROOT%.venv\Scripts\python.exe"
set "VENV_PIP=%ROOT%.venv\Scripts\pip.exe"
set "LOG=%ROOT%kurulum.log"

echo. > "%LOG%"
echo [%date% %time%] Baslatiliyor >> "%LOG%"

echo.
echo  ============================================
echo    MALZEME STOK TAKIP SISTEMI
echo  ============================================
echo    Klasor: %ROOT%
echo  ============================================
echo.

:: ---- Python bul ----
set "PY_CMD="
where python >nul 2>&1
if !errorlevel! equ 0 set "PY_CMD=python"

if not defined PY_CMD (
    where py >nul 2>&1
    if !errorlevel! equ 0 set "PY_CMD=py -3"
)

if not defined PY_CMD (
    echo  [HATA] Python bulunamadi!
    echo  Python 3 kurun: https://www.python.org/downloads/
    echo  Kurulumda "Add Python to PATH" seceneginini isaretleyin.
    echo  [HATA] Python bulunamadi >> "%LOG%"
    pause
    exit /b 1
)

echo  [OK] Python: %PY_CMD%
%PY_CMD% --version
echo  Python: %PY_CMD% >> "%LOG%"

:: ---- Database2.accdb kontrol ----
if not exist "%ROOT%Database2.accdb" (
    echo.
    echo  [HATA] Database2.accdb bulunamadi!
    echo  Su klasore kopyalayin:
    echo  %ROOT%
    echo  [HATA] Database2.accdb yok >> "%LOG%"
    pause
    exit /b 1
)
echo  [OK] Database2.accdb bulundu

:: ---- data klasoru ----
if not exist "%ROOT%data" mkdir "%ROOT%data"

:: ---- Sanal ortam ----
if not exist "%VENV_PY%" (
    echo.
    echo  [..] Sanal ortam olusturuluyor...
    %PY_CMD% -m venv "%ROOT%.venv"
    if !errorlevel! neq 0 (
        echo  [HATA] Sanal ortam olusturulamadi!
        echo  [HATA] venv basarisiz >> "%LOG%"
        pause
        exit /b 1
    )
)

if not exist "%VENV_PY%" (
    echo  [HATA] .venv\Scripts\python.exe bulunamadi!
    pause
    exit /b 1
)

:: ---- Paket kur ----
echo  [..] Paketler kuruluyor...
"%VENV_PY%" -m pip install --upgrade pip >> "%LOG%" 2>&1
"%VENV_PY%" -m pip install -r "%ROOT%requirements.txt" >> "%LOG%" 2>&1
if !errorlevel! neq 0 (
    echo  [HATA] Paket kurulumu basarisiz!
    echo  Detay: %LOG%
    pause
    exit /b 1
)
echo  [OK] Paketler hazir

:: ---- Veritabani aktar ----
if not exist "%ROOT%data\malzeme.db" (
    echo  [..] Access verisi aktariliyor (ilk kurulum)...
    set "ACCDB_PATH=%ROOT%Database2.accdb"
    set "DB_PATH=%ROOT%data\malzeme.db"
    "%VENV_PY%" "%ROOT%scripts\import_access.py" >> "%LOG%" 2>&1
    if !errorlevel! neq 0 (
        echo  [HATA] Veri aktarimi basarisiz!
        echo  Detay: %LOG%
        pause
        exit /b 1
    )
    echo  [OK] Veri aktarimi tamamlandi
) else (
    echo  [OK] Veritabani mevcut
)

:: ---- Uygulamayi baslat ----
echo.
echo  ============================================
echo    Uygulama baslatiliyor...
echo    Adres: http://127.0.0.1:5000
echo.
echo    Durdurmak icin bu pencereyi kapatin
echo  ============================================
echo.

set "DB_PATH=%ROOT%data\malzeme.db"
set "FLASK_APP=app"

start "" /min cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:5000"

"%VENV_PY%" "%ROOT%run.py"
set "EXIT_CODE=!errorlevel!"

if !EXIT_CODE! neq 0 (
    echo.
    echo  [HATA] Uygulama kapandi (kod: !EXIT_CODE!)
    echo  Detay icin: %LOG%
    echo.
)

pause
exit /b !EXIT_CODE!

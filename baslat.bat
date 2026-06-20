@echo off
setlocal
chcp 65001 >nul 2>&1
title Malzeme Stok Takip Sistemi
color 0A

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "VENV_PY=%ROOT%.venv\Scripts\python.exe"
set "LOG=%ROOT%kurulum.log"

echo.
echo  ============================================
echo    MALZEME STOK TAKIP SISTEMI
echo  ============================================
echo    Klasor: %ROOT%
echo  ============================================
echo.

echo Baslatiliyor > "%LOG%"

REM --- Python bul ---
set "USE_PY=0"
where python >nul 2>&1
if %errorlevel%==0 set "USE_PY=1"

if "%USE_PY%"=="0" goto find_py_launcher
echo  [OK] Python bulundu
python --version
echo python >> "%LOG%"
goto python_found

:find_py_launcher
where py >nul 2>&1
if not %errorlevel%==0 goto no_python
echo  [OK] Python bulundu
py -3 --version
echo py -3 >> "%LOG%"
goto python_found

:no_python
echo  [HATA] Python bulunamadi!
echo  Python 3 kurun: https://www.python.org/downloads/
echo  Kurulumda Add Python to PATH secenegini isaretleyin.
echo Python yok >> "%LOG%"
pause
exit /b 1

:python_found

REM --- Database2.accdb ---
if exist "%ROOT%Database2.accdb" goto accdb_ok
echo.
echo  [HATA] Database2.accdb bulunamadi!
echo  Su klasore kopyalayin:
echo  %ROOT%
echo accdb yok >> "%LOG%"
pause
exit /b 1

:accdb_ok
echo  [OK] Database2.accdb bulundu

REM --- data klasoru ---
if exist "%ROOT%data" goto data_ok
mkdir "%ROOT%data"
:data_ok

REM --- Sanal ortam ---
if exist "%VENV_PY%" goto venv_ok
echo.
echo  [..] Sanal ortam olusturuluyor...
if "%USE_PY%"=="1" goto make_venv_python
py -3 -m venv "%ROOT%.venv"
goto venv_made
:make_venv_python
python -m venv "%ROOT%.venv"
:venv_made
if not exist "%VENV_PY%" goto venv_fail
:venv_ok

REM --- Paketler ---
echo  [..] Paketler kuruluyor...
"%VENV_PY%" -m pip install --upgrade pip >> "%LOG%" 2>&1
"%VENV_PY%" -m pip install -r "%ROOT%requirements.txt" >> "%LOG%" 2>&1
if not %errorlevel%==0 goto pip_fail
echo  [OK] Paketler hazir

REM --- Veritabani ---
if exist "%ROOT%data\malzeme.db" goto db_ok
echo  [..] Access verisi aktariliyor...
set "ACCDB_PATH=%ROOT%Database2.accdb"
set "DB_PATH=%ROOT%data\malzeme.db"
"%VENV_PY%" "%ROOT%scripts\import_access.py" >> "%LOG%" 2>&1
if not %errorlevel%==0 goto import_fail
echo  [OK] Veri aktarimi tamamlandi
goto db_ok

:import_fail
echo  [HATA] Veri aktarimi basarisiz!
echo  Detay: %LOG%
pause
exit /b 1

:pip_fail
echo  [HATA] Paket kurulumu basarisiz!
echo  Detay: %LOG%
pause
exit /b 1

:venv_fail
echo  [HATA] Sanal ortam olusturulamadi!
echo  Detay: %LOG%
pause
exit /b 1

:db_ok
if exist "%ROOT%data\malzeme.db" echo  [OK] Veritabani hazir

REM --- Uygulama ---
echo.
echo  ============================================
echo    Uygulama baslatiliyor...
echo    Adres: http://127.0.0.1:5000
echo    Durdurmak icin bu pencereyi kapatin
echo  ============================================
echo.

set "DB_PATH=%ROOT%data\malzeme.db"
start "" cmd /c "ping -n 4 127.0.0.1 >nul && start http://127.0.0.1:5000"

"%VENV_PY%" "%ROOT%run.py"
set "ERR=%errorlevel%"

if "%ERR%"=="0" goto done
echo.
echo  [HATA] Uygulama kapandi. Kod: %ERR%
echo  Detay: %LOG%

:done
pause
exit /b %ERR%

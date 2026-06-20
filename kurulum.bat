@echo off
setlocal
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

set "USE_PY=0"
where python >nul 2>&1
if %errorlevel%==0 set "USE_PY=1"

if "%USE_PY%"=="0" goto check_py
goto py_ok

:check_py
where py >nul 2>&1
if not %errorlevel%==0 goto no_python
:py_ok

if exist "%ROOT%Database2.accdb" goto accdb_ok
echo  [HATA] Database2.accdb bu klasorde yok!
echo  Konum: %ROOT%
pause
exit /b 1

:accdb_ok

echo  [1/4] Sanal ortam...
if exist "%ROOT%.venv" rmdir /s /q "%ROOT%.venv"
if "%USE_PY%"=="1" goto make_venv_python
py -3 -m venv "%ROOT%.venv"
goto venv_made
:make_venv_python
python -m venv "%ROOT%.venv"
:venv_made
if not exist "%VENV_PY%" goto venv_fail

echo  [2/4] Paketler...
"%VENV_PY%" -m pip install --upgrade pip
"%VENV_PY%" -m pip install -r "%ROOT%requirements.txt"
if not %errorlevel%==0 goto pip_fail

echo  [3/4] Veritabani...
if exist "%ROOT%data" goto data_exists
mkdir "%ROOT%data"
:data_exists
if exist "%ROOT%data\malzeme.db" del "%ROOT%data\malzeme.db"
set "ACCDB_PATH=%ROOT%Database2.accdb"
set "DB_PATH=%ROOT%data\malzeme.db"
"%VENV_PY%" "%ROOT%scripts\import_access.py" > "%LOG%" 2>&1
if not %errorlevel%==0 goto import_fail

echo  [4/4] Kurulum tamamlandi!
echo.
echo  Simdi baslat.bat dosyasina cift tiklayin.
echo.
pause
exit /b 0

:no_python
echo  [HATA] Python bulunamadi!
pause
exit /b 1

:venv_fail
echo  [HATA] Sanal ortam olusturulamadi!
pause
exit /b 1

:pip_fail
echo  [HATA] Paket kurulumu basarisiz!
pause
exit /b 1

:import_fail
echo  [HATA] Veri aktarimi basarisiz!
echo  Log dosyasi: %LOG%
type "%LOG%"
pause
exit /b 1

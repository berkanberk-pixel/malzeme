@echo off
setlocal
chcp 65001 >nul 2>&1
title Sistem Kontrolu
color 0E

set "ROOT=%~dp0"
cd /d "%ROOT%"
set "OK=1"

echo.
echo  === SISTEM KONTROLU ===
echo  Klasor: %ROOT%
echo.

echo  [1] Python
where python >nul 2>&1
if %errorlevel%==0 goto py1_ok
where py >nul 2>&1
if %errorlevel%==0 goto py2_ok
echo       HATA - Python yok
set "OK=0"
goto check_accdb

:py1_ok
python --version
echo       OK - python
goto check_accdb

:py2_ok
py -3 --version
echo       OK - py -3
goto check_accdb

:check_accdb
echo.
echo  [2] Database2.accdb
if exist "%ROOT%Database2.accdb" goto accdb_ok
echo       HATA - Dosya yok
set "OK=0"
goto check_venv

:accdb_ok
echo       OK

:check_venv
echo.
echo  [3] Sanal ortam
if exist "%ROOT%.venv\Scripts\python.exe" goto venv_ok
echo       YOK - baslat.bat olusturacak
goto check_db

:venv_ok
echo       OK

:check_db
echo.
echo  [4] Veritabani
if exist "%ROOT%data\malzeme.db" goto db_ok
echo       YOK - ilk calistirmada olusacak
goto check_pkg

:db_ok
echo       OK

:check_pkg
echo.
echo  [5] Paket testi
if not exist "%ROOT%.venv\Scripts\python.exe" goto pkg_skip
"%ROOT%.venv\Scripts\python.exe" -c "import flask; import access_parser; print('      OK')"
if not %errorlevel%==0 goto pkg_fail
goto result

:pkg_fail
echo       HATA - Paketler eksik
set "OK=0"
goto result

:pkg_skip
echo       Atlandi

:result
echo.
if "%OK%"=="1" goto all_ok
echo  SONUC: Sorun var - yukaridaki HATA satirlarina bakin
goto end

:all_ok
echo  SONUC: Hazir - baslat.bat calistirabilirsiniz

:end
echo.
pause

@echo off
chcp 65001 >nul 2>&1
title Sistem Kontrolu
color 0E

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo  === SISTEM KONTROLU ===
echo  Klasor: %ROOT%
echo.

set "OK=1"

echo  [1] Python
where python >nul 2>&1 && (python --version && echo  OK) || (
    where py >nul 2>&1 && (py -3 --version && echo  OK) || (
        echo  HATA - Python yok
        set "OK=0"
    )
)

echo.
echo  [2] Database2.accdb
if exist "%ROOT%Database2.accdb" (echo  OK) else (
    echo  HATA - Dosya yok
    set "OK=0"
)

echo.
echo  [3] Sanal ortam
if exist "%ROOT%.venv\Scripts\python.exe" (echo  OK) else (echo  YOK - baslat.bat olusturacak)

echo.
echo  [4] Veritabani
if exist "%ROOT%data\malzeme.db" (echo  OK) else (echo  YOK - ilk calistirmada olusacak)

echo.
echo  [5] Paket testi
if exist "%ROOT%.venv\Scripts\python.exe" (
    "%ROOT%.venv\Scripts\python.exe" -c "import flask; import access_parser; print('  OK')"
    if errorlevel 1 (
        echo  HATA - Paketler eksik
        set "OK=0"
    )
) else (
    echo  Atlandi - once baslat.bat calistirin
)

echo.
if "%OK%"=="1" (echo  SONUC: Hazir - baslat.bat calistirabilirsiniz) else (echo  SONUC: Sorun var - yukaridaki HATA satirlarina bakin)
echo.
pause

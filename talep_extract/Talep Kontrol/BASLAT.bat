@echo off
setlocal
rem Bu dosya geriye donuk uyumluluk icindir. CMD tamamen gizli acilis icin Talep Kontrol.vbs kullanin.
start "" wscript.exe "%~dp0Talep Kontrol.vbs"
exit /b 0

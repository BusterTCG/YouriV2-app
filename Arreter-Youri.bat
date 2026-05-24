@echo off
title Youri V2 - Arret serveur dev
cd /d "%~dp0"

echo.
echo  Arret du serveur dev Youri V2 (port 3001)...
echo.

REM Tue tous les process node.exe qui tournent sur le port 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo  Kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

REM Tue aussi cloudflared (si le tunnel mobile etait actif)
taskkill /F /IM cloudflared.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo  Cloudflared tunnel mobile arrete.
)

echo.
echo  Serveur Youri V2 arrete. Cette fenetre se ferme dans 3 secondes.
timeout /t 3 /nobreak >nul

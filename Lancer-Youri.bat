@echo off
title Youri V2 - Serveur dev (PC + Mobile)
cd /d "%~dp0"

echo.
echo  ============================================
echo    YOURI V2 - PANGEE PROD - Lancement local
echo  ============================================
echo.

REM ============================================
REM   DEPENDANCE : KuroNeko-App doit tourner aussi
REM ============================================
REM Youri V2 consomme l'annuaire (Contacts + Lieux) via l'API REST de KN.
REM Sans KN actif, les pages /contacts et /lieux affichent "Annuaire indisponible".
REM On verifie si KN tourne deja sur 3000 ; sinon on lance Lancer-KuroNeko.bat
REM dans une fenetre dediee.

set KN_DIR=C:\Users\stani\Dev\KuroNeko-App
set KN_BAT=%KN_DIR%\Lancer-KuroNeko.bat

curl -s -o nul -m 1 http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] KuroNeko-App tourne deja sur http://localhost:3000
) else (
    if exist "%KN_BAT%" (
        echo  [INFO] KuroNeko-App n'est pas actif. Demarrage en parallele...
        start "Kuro Neko - dev parallel" cmd /c "%KN_BAT%"
        echo  [OK] Une fenetre dediee KuroNeko a ete ouverte. KN demarre en
        echo       arriere-plan ^(env. 5-10s^).
    ) else (
        echo  [ATTENTION] %KN_BAT% introuvable.
        echo              Les pages /contacts et /lieux afficheront "Annuaire indisponible".
        echo              Lance manuellement KuroNeko si tu en as besoin.
    )
)
echo.

REM Verifie si Youri tourne deja sur le port 3001.
curl -s -o nul -m 1 http://localhost:3001 >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Le serveur Youri tourne deja sur http://localhost:3001
    echo       Ouverture du navigateur...
    start "" http://localhost:3001/dashboard
    timeout /t 2 /nobreak >nul
    exit /b 0
)

REM ============================================
REM   TUNNEL MOBILE - Cloudflared
REM ============================================
REM Lance cloudflared dans une fenetre dediee pour generer une URL HTTPS
REM publique temporaire qui permet de tester l'app sur smartphone.
REM Le HMR/Fast Refresh marche aussi (modifs en live sur le tel).
REM ============================================

set CLOUDFLARED=C:\Users\stani\Dev\cloudflared.exe

if exist "%CLOUDFLARED%" (
    echo  Demarrage du tunnel MOBILE en parallele...
    echo.
    echo  Une 2eme fenetre va s'ouvrir avec l'URL HTTPS a copier
    echo  dans Safari sur ton iPhone.
    echo.
    echo  Cherche la ligne du type :
    echo     https://xxx-yyy-zzz.trycloudflare.com
    echo.
    start "Youri V2 - Tunnel Mobile (iPhone)" cmd /k "echo. && echo  ============================================ && echo    URL HTTPS POUR TON IPHONE && echo  ============================================ && echo. && echo  La ligne 'https://...trycloudflare.com' apparait && echo  ci-dessous dans quelques secondes. && echo  Copie-la et colle-la dans Safari sur ton telephone. && echo. && echo  Ne FERME PAS cette fenetre tant que tu utilises && echo  l'app sur ton tel (sinon le tunnel se coupe). && echo. && echo  ============================================ && echo. && \"%CLOUDFLARED%\" tunnel --url http://localhost:3001"
) else (
    echo  [INFO] Cloudflared n'est pas installe a "%CLOUDFLARED%".
    echo         Le tunnel mobile sera saute. L'app reste accessible
    echo         depuis ce PC sur http://localhost:3001.
    echo.
)

echo  Demarrage du serveur Next.js (port 3001)...
echo  Le navigateur s'ouvrira automatiquement quand l'app sera prete.
echo.
echo  IMPORTANT : garde cette fenetre OUVERTE pendant l'utilisation.
echo              Ferme-la pour arreter l'application.
echo.

REM Ouvre le navigateur apres 8 secondes (laisse le temps au serveur Next de demarrer).
start /b cmd /c "timeout /t 8 /nobreak >nul && start """" http://localhost:3001/dashboard"

REM Lance le serveur dev (bloquant - la fenetre reste ouverte tant que le serveur tourne).
call npm run dev

echo.
echo  Serveur arrete. Appuie sur une touche pour fermer cette fenetre.
echo  N'oublie pas de fermer aussi la fenetre du tunnel mobile.
pause >nul

@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   Cally Guard - GitHub'a yukleniyor
echo ========================================
echo.
git add -A
git commit -m "guard" 2>nul
git branch -M main
git remote set-url origin https://github.com/ozkanqbyte/cally-guard.git 2>nul
git remote add origin https://github.com/ozkanqbyte/cally-guard.git 2>nul
echo.
echo GitHub'a gonderiliyor...
echo.
git push -u origin main --force
echo.
echo ========================================
echo   Yukarida "main -^> main" (forced update) varsa BASARILI.
echo ========================================
echo.
pause

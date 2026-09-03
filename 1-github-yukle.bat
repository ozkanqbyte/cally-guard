@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   Cally Guard - GitHub'a yukleniyor
echo ========================================
echo.
git remote set-url origin https://github.com/ozkanqbyte/cally-guard.git 2>nul
git remote add origin https://github.com/ozkanqbyte/cally-guard.git 2>nul
git branch -M main
git add -A
git commit -m "guard" 2>nul
echo.
echo GitHub'a gonderiliyor... (giris penceresi cikabilir)
echo.
git push -u origin main
echo.
echo ========================================
echo   Bitti. Yukarida "main -^> main" varsa BASARILI.
echo   403 / denied yaziyorsa: repoyu ozkanqbyte ile acmadin.
echo ========================================
echo.
pause

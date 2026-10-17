@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Subiendo Business Analytics a https://github.com/NoeGT93/Bussines-Analitics
echo.
where git >nul 2>nul
if errorlevel 1 (
  echo  Git no esta instalado. Descargalo en https://git-scm.com/download/win y vuelve a abrir este archivo.
  pause
  exit /b 1
)
git push -u origin main
if errorlevel 1 (
  echo.
  echo  No se pudo subir. Si GitHub dice "rejected", el repositorio ya tenia archivos.
  echo  Para reemplazarlos por este proyecto escribe:  git push -u origin main --force
  pause
  exit /b 1
)
echo.
echo  Listo. Ahora en GitHub: Settings - Pages - Source: GitHub Actions.
echo  La app quedara en https://noegt93.github.io/Bussines-Analitics/
pause

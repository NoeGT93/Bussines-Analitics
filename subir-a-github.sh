#!/usr/bin/env bash
# Sube este proyecto a https://github.com/NoeGT93/Bussines-Analitics
cd "$(dirname "$0")" || exit 1
if ! command -v git >/dev/null 2>&1; then
  echo "Git no está instalado. Descárgalo en https://git-scm.com/downloads"
  exit 1
fi
echo "Subiendo Business Analytics a GitHub..."
if git push -u origin main; then
  echo
  echo "Listo. En GitHub: Settings → Pages → Source: GitHub Actions."
  echo "La app quedará en https://noegt93.github.io/Bussines-Analitics/"
else
  echo
  echo "No se pudo subir. Si GitHub dice 'rejected', el repositorio ya tenía archivos."
  echo "Para reemplazarlos por este proyecto: git push -u origin main --force"
fi

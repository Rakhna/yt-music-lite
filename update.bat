@echo off
title Actualizar YT Music Lite
cd /d "%~dp0"

echo [INFO] Verificando actualizaciones en GitHub...
git pull origin main

echo [INFO] Actualizando dependencias...
call pnpm install

echo [INFO] Compilando recursos del frontend...
call pnpm run build

echo.
echo [INFO] YT Music Lite se ha actualizado correctamente.
echo Puedes reiniciar la aplicacion desde tu acceso directo del Escritorio.
echo.
pause

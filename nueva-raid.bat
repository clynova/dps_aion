@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  === Nueva raid: extraer de Questlog y publicar en la web ===
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\publicar.ps1" %*
if errorlevel 1 (
  echo.
  echo  No se pudo publicar la raid. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo.
echo  Listo. Para el analisis y las recomendaciones, pidele a Claude: "analiza la ultima raid".
echo.
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  === Nueva raid: extraer de Questlog y publicar en dpsaion.vercel.app ===
echo.
git pull --rebase --autostash -q
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\extraer-raid.ps1" %*
if errorlevel 1 (
  echo.
  echo  No se pudo extraer la raid. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo  Actualizando nombres de habilidades desde questlog.gg...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\actualizar-nombres.ps1" -Idioma es
if errorlevel 1 echo  (No se pudieron actualizar los nombres en espanol; la raid se publica igual.)
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\actualizar-nombres.ps1" -Idioma en
if errorlevel 1 echo  (No se pudieron actualizar los nombres en ingles; la raid se publica igual.)
echo  Guardando en la base de datos (db\aion.duckdb)...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\cargar-db.ps1"
if errorlevel 1 echo  (No se pudo actualizar la base de datos; la raid se publica igual.)
git add raids jugadores nombres.json nombres.en.json
git commit -q -m "Nueva raid desde Questlog"
git push -q
if errorlevel 1 (
  echo.
  echo  No se pudo subir a GitHub. Revisa tu conexion o el inicio de sesion de Git.
  pause
  exit /b 1
)
echo.
echo  Listo. En un minuto estara en https://dpsaion.vercel.app/
echo  Para el analisis y las recomendaciones, pidele a Claude: "analiza la ultima raid".
echo.
pause

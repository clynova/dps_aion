<#
  Consulta rápida a la base de datos db/aion.duckdb (la crea y llena tools/cargar-db.ps1).
    powershell -ExecutionPolicy Bypass -File tools\consulta.ps1 "select * from intentos where raid like '2026-11-07-1906%'"
    powershell -ExecutionPolicy Bypass -File tools\consulta.ps1 -Archivo consulta.sql
  Sin argumentos abre la consola interactiva de DuckDB.
#>
param([string]$Sql, [string]$Archivo, [string]$Repo = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$db = Join-Path $Repo 'db\aion.duckdb'
if (-not (Test-Path $db)) { throw 'No existe db\aion.duckdb: ejecuta antes tools\cargar-db.ps1' }
$c = Get-Command duckdb -ErrorAction SilentlyContinue
$duck = if ($c) { $c.Source } else { (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter duckdb.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
if (-not $duck) { throw 'No encuentro duckdb.exe. Instálalo con: winget install DuckDB.cli' }
if ($Archivo) { & $duck $db -readonly -f $Archivo }
elseif ($Sql) { & $duck $db -readonly -c $Sql }
else { & $duck $db }

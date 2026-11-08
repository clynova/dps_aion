<#
  Carga los datos de Questlog en la base de datos db/aion.duckdb.

  1. Copia a db/archivo/ los encuentros y runs nuevos de %APPDATA%\Questlog\aion-2. Questlog solo guarda
     los últimos 500 encuentros y va borrando los antiguos: el archivo los conserva para siempre.
  2. Pasa a las tablas (db/esquema.sql) los encuentros del archivo que aún no están en la base, en tandas.
  3. Recarga las runs, las raids de la web (raids/, _privado/) y los nombres (nombres.json / nombres.en.json).

  Uso:
    powershell -ExecutionPolicy Bypass -File tools\cargar-db.ps1             # lo nuevo
    ... -Reconstruir                                                          # borra la base y la rehace desde el archivo
  Consultas: duckdb db\aion.duckdb  (o tools\consulta.ps1 "select ...")
#>
param(
  [switch]$Reconstruir,
  [int]$Tanda = 20,
  [string]$Repo = (Split-Path $PSScriptRoot -Parent)
)
$ErrorActionPreference = 'Stop'
$q = "$env:APPDATA\Questlog\aion-2"
$dbDir = Join-Path $Repo 'db'
$db = Join-Path $dbDir 'aion.duckdb'
$archEnc = Join-Path $dbDir 'archivo\encounters'
$archRuns = Join-Path $dbDir 'archivo\runs'
New-Item -ItemType Directory -Force $archEnc, $archRuns | Out-Null

function Find-DuckDb {
  $c = Get-Command duckdb -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $p = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter duckdb.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($p) { return $p.FullName }
  throw 'No encuentro duckdb.exe. Instálalo con: winget install DuckDB.cli'
}
$duck = Find-DuckDb
# El SQL va por un archivo temporal: por la tubería, PowerShell 5.1 estropea los comandos .read
$tmpSql = Join-Path $env:TEMP 'dps-aion-cargar.sql'
function Invoke-Duck([string]$sql) {
  [IO.File]::WriteAllText($tmpSql, $sql, (New-Object Text.UTF8Encoding $false))
  $out = & $duck $db -bail -noheader -list -f $tmpSql 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { throw "DuckDB: $($out -join "`n")" }
  $out
}
$fwd = { param($p) $p -replace '\\', '/' }

# 1. Archivo: copia lo nuevo (los encuentros no cambian; las runs sí mientras estás dentro)
$nuevos = 0
if (Test-Path "$q\encounters") {
  foreach ($f in Get-ChildItem "$q\encounters" -Filter '*.json.gz') {
    $dest = Join-Path $archEnc $f.Name
    if (-not (Test-Path $dest)) { try { Copy-Item $f.FullName $dest; $nuevos++ } catch { Write-Warning "No pude copiar $($f.Name): $($_.Exception.Message)" } }
  }
  foreach ($f in Get-ChildItem "$q\runs" -Filter '*.json' | Where-Object { $_.Name -ne 'index.json' }) {
    $dest = Join-Path $archRuns $f.Name
    if (-not (Test-Path $dest) -or (Get-Item $dest).LastWriteTime -lt $f.LastWriteTime) { try { Copy-Item $f.FullName $dest -Force } catch { Write-Warning "No pude copiar $($f.Name)" } }
  }
} else { Write-Warning "No encuentro Questlog en $q; cargo solo lo que ya hay en el archivo." }
Write-Host "Archivo: $nuevos encuentros nuevos copiados ($((Get-ChildItem $archEnc -Filter '*.json.gz').Count) en total)."

# 2. Encuentros que faltan en la base
if ($Reconstruir -and (Test-Path $db)) { Remove-Item $db, "$db.wal" -ErrorAction SilentlyContinue }
$esquema = & $fwd (Join-Path $dbDir 'esquema.sql')
Invoke-Duck ".read '$esquema'" | Out-Null
$cargados = @(Invoke-Duck 'select id from encuentros;')
$set = New-Object 'System.Collections.Generic.HashSet[string]'; foreach ($id in $cargados) { [void]$set.Add([string]$id) }
$pendientes = @(Get-ChildItem $archEnc -Filter '*.json.gz' | Where-Object { -not $set.Contains(($_.Name -replace '\.json\.gz$', '')) })
$cargar = & $fwd (Join-Path $dbDir 'cargar.sql')
for ($i = 0; $i -lt $pendientes.Count; $i += $Tanda) {
  $lote = $pendientes[$i..([math]::Min($i + $Tanda, $pendientes.Count) - 1)]
  $lista = ($lote | ForEach-Object { "'" + (& $fwd $_.FullName) + "'" }) -join ', '
  Invoke-Duck @"
set preserve_insertion_order = false;
begin transaction;
create or replace temp table raw as
  select json ->> 'id' id, json ->> 'log' log, json -> 'fight' fight, json -> 'overview' overview
  from read_json_objects([$lista], maximum_object_size = 134217728);
.read '$cargar'
commit;
"@ | Out-Null
  Write-Host ("  encuentros {0}-{1} de {2}" -f ($i + 1), ($i + $lote.Count), $pendientes.Count)
}

# 3. Runs, raids y nombres (se recargan enteros)
$runsSql = & $fwd (Join-Path $dbDir 'cargar-runs.sql')
$webSql = & $fwd (Join-Path $dbDir 'cargar-web.sql')
$vistasSql = & $fwd (Join-Path $dbDir 'vistas.sql')
$runsGlob = & $fwd (Join-Path $archRuns '*.json')
Push-Location $Repo
try {
  Invoke-Duck @"
begin transaction;
delete from runs; delete from run_grupo; delete from run_miembros; delete from run_build;
create or replace temp table raw_runs as
  select regexp_extract(filename, '([0-9a-f-]{36})\.json$', 1) id, json j
  from read_json_objects('$runsGlob', filename = true, maximum_object_size = 67108864);
.read '$runsSql'
.read '$webSql'
.read '$vistasSql'
commit;
checkpoint;
"@ | Out-Null
} finally { Pop-Location }

$resumen = Invoke-Duck "select count(*) || ' encuentros, ' || (select count(*) from runs) || ' runs, ' || (select count(*) from raids) || ' raids, ' || (select count(*) from golpes) || ' golpes' from encuentros;"
Write-Host "Base de datos: $resumen"
Write-Host "  $db"

<#
  Extrae una raid de la base de datos (db/aion.duckdb, que llena tools/cargar-db.ps1 desde Questlog) y escribe su
  JSON en una carpeta temporal. Las cifras las calcula db/raid.sql. No toca el repo: la raid se publica en la web con
  tools/publicar.ps1 (que llama a este script) y la web guarda todo en su base de datos.

  Uso:
    powershell -ExecutionPolicy Bypass -File tools\extraer-raid.ps1            # la última raid
    powershell -ExecutionPolicy Bypass -File tools\extraer-raid.ps1 -Run 656c  # una run concreta (inicio del id)
    ... -Lista                                                                  # ver las últimas runs
    ... -Run dc39 -Jefe 2301006                                                 # una run, centrada en un jefe concreto
    ... -SinCargar                                                              # no actualiza antes la base desde Questlog
    ... -Api https://dpsaion.vercel.app                                         # nombre del jefe desde la web
    ... -Salida C:\carpeta   -BaseDatos C:\otra\aion.duckdb                     # otra base (no la actualiza)

  Escribe <Salida>\<slug>.json (por defecto %TEMP%\dps-aion) y devuelve esa ruta como última línea.
  El nombre del jefe (y con él el slug) sale de la web (-Api) o, si no, de nombres.json del repo; si no lo encuentra,
  queda «Jefe <id>».
#>
param(
  [Alias('Run')][string]$RunId,
  [switch]$Lista,
  [switch]$SinCargar,
  [Alias('Jefe')][string]$JefeNpc,
  [string]$Api,
  [string]$Salida = (Join-Path $env:TEMP 'dps-aion'),
  [string]$Repo = (Split-Path $PSScriptRoot -Parent),
  [string]$BaseDatos
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'duckdb.ps1')
$utf8 = New-Object Text.UTF8Encoding $false
$db = if ($BaseDatos) { $BaseDatos } else { Join-Path $Repo 'db\aion.duckdb' }

function Read-Json($p) { [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) | ConvertFrom-Json }
function FromMs($ms) { [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$ms).ToLocalTime() }
function Slugify($s) {
  $n = $s.Normalize([Text.NormalizationForm]::FormD)
  $n = -join ($n.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' })
  ($n.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
}
# Filas de una consulta como objetos (DuckDB devuelve una columna JSON por fila)
function Query($sql) { @(Invoke-Duck $db $sql -SoloLectura | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json }) }

if (-not $SinCargar -and -not $BaseDatos) { & (Join-Path $PSScriptRoot 'cargar-db.ps1') -Repo $Repo | Out-Host }
if (-not (Test-Path $db)) { throw "No existe $db : ejecuta antes tools\cargar-db.ps1" }

# Runs con encuentros: jefe principal = el npc con más intentos de más de 5 s (en empate, el último que se intentó).
# La misma regla está en db/runs.sql (la usa la subida desde el navegador): si cambias una, cambia la otra.
$runsSql = @"
with e as (
  select ru.id, ru.log, ru.mazmorra, epoch_ms(ru.entrada) entrada, e.npc, e.duracion_s, e.inicio
  from runs ru join encuentros e on e.log = ru.log
), jefes as (
  select id, npc, count(*) n, max(inicio) ultimo from e where duracion_s > 5 group by id, npc
)
select to_json({ 'id': id, 'entrada': entrada, 'mazmorra': any_value(mazmorra), 'encuentros': count(*),
  'jefe': (select arg_max(npc, n * 1e13 + epoch_ms(ultimo)) from jefes j where j.id = e.id),
  'jugadores': (select count(*) from run_grupo g where g.run = e.id) })
from e group by id, entrada order by entrada desc
"@
if ($Lista) {
  Query "$runsSql limit 15;" | ForEach-Object {
    '{0}  {1:yyyy-MM-dd HH:mm}  mazmorra {2}  jefe {3}  encuentros {4}  jugadores {5}' -f $_.id.Substring(0, 8), (FromMs $_.entrada), $_.mazmorra, $_.jefe, $_.encuentros, $_.jugadores
  }
  return
}
$runs = Query "$runsSql;"
# Sin -Run: la última raid, es decir, la última run con 8 o más jugadores (las mazmorras de 5 no se publican solas)
$run = if ($RunId) { $runs | Where-Object { $_.id -like "$RunId*" } | Select-Object -First 1 } else { $runs | Where-Object { $_.jugadores -ge 8 } | Select-Object -First 1 }
if (-not $run) { throw 'No encuentro esa run (o no tiene encuentros guardados).' }
$mainNpc = $run.jefe
if ($JefeNpc) {
  $n = Query "select to_json({'n': count(*)}) from encuentros e join runs r on r.log = e.log where r.id = $(Sql-Texto $run.id) and e.npc = $([int]$JefeNpc) and e.duracion_s > 5;"
  if (-not $n[0].n) { throw "Esa run no tiene intentos al jefe $JefeNpc." }
  $mainNpc = [int]$JefeNpc
}
if (-not $mainNpc) { throw 'Esta run no tiene intentos de más de 5 s.' }

# Nombres de los npcs en español: de la web si se indica -Api (WebClient en UTF-8: Invoke-RestMethod de PowerShell 5.1
# lee mal las tildes cuando la respuesta no declara charset); si no, nombres.json del repo.
$npcs = $null
if ($Api) {
  try {
    $wc = New-Object Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
    $npcs = ($wc.DownloadString(($Api.TrimEnd('/')) + '/api/v1/nombres?idioma=es') | ConvertFrom-Json).npcs
  } catch { Write-Warning "No se pudieron leer los nombres de la web ($($_.Exception.Message)); se usa nombres.json." }
}
if (-not $npcs) {
  $nombresPath = Join-Path $Repo 'nombres.json'
  if (Test-Path $nombresPath) { $npcs = (Read-Json $nombresPath).npcs }
}
function NpcName($id) { $n = if ($npcs) { $npcs."$id" } else { $null }; if ($n) { $n } else { "Jefe $id" } }

$fecha = FromMs $run.entrada
$jefe = NpcName $mainNpc
$slug = '{0:yyyy-MM-dd-HHmm}-{1}' -f $fecha, (Slugify $jefe)
New-Item -ItemType Directory -Force $Salida | Out-Null
$archivo = Join-Path $Salida "$slug.json"

# db/raid.sql lee la raid de la tabla raids (slug, run, npc) de la base local y genera el JSON
Invoke-Duck $db @"
delete from raids where slug = $(Sql-Texto $slug);
insert into raids values ($(Sql-Texto $slug), $(Sql-Texto $run.id), $mainNpc, $(Sql-Texto $fecha.ToString('yyyy-MM-ddTHH:mm:sszzz'))::timestamptz, true);
set variable slug = $(Sql-Texto $slug);
set variable jefe = $(Sql-Texto $jefe);
set variable fecha = $(Sql-Texto $fecha.ToString('yyyy-MM-ddTHH:mm:sszzz'));
set variable extraido = $(Sql-Texto (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'));
.mode list
.headers off
.output $($archivo -replace '\\', '/')
.read $((Join-Path $Repo 'db\raid.sql') -replace '\\', '/')
.output
"@ | Out-Null
$data = Read-Json $archivo
if (-not $data.resumen.intentos) { throw "No salió ningún intento para $slug." }

$r = $data.resumen
Write-Host ''
Write-Host "Raid extraida: $jefe ($('{0:dd/MM/yyyy HH:mm}' -f $fecha))"
Write-Host "  $($r.intentos) intentos, mejor $($r.mejor_pct) %, $(if ($r.matado) { 'MATADO' } else { 'sin kill' })"
Write-Output $archivo

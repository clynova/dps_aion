<#
  Extrae una raid de la base de datos (db/aion.duckdb, que llena tools/cargar-db.ps1 desde Questlog)
  y la guarda en raids/<slug>/. Las cifras las calcula db/raid.sql.

  Uso:
    powershell -ExecutionPolicy Bypass -File tools\extraer-raid.ps1            # la última raid
    powershell -ExecutionPolicy Bypass -File tools\extraer-raid.ps1 -Run 656c  # una run concreta (inicio del id)
    ... -Lista                                                                  # ver las últimas runs
    ... -Run dc39 -Jefe 2301006                                                 # una run, centrada en un jefe concreto
    ... -Reindexar                                                              # solo rehace raids/index.json y los perfiles
    ... -SinCargar                                                              # no actualiza antes la base desde Questlog

  Crea o actualiza:
    raids/<slug>/index.html   copia de assets/raid-shell.html
    raids/<slug>/data.json    estadísticas
    raids/<slug>/analisis.json  solo si no existe (plantilla vacía, "pendiente")
    raids/index.json          listado para la página principal
#>
param(
  [Alias('Run')][string]$RunId,
  [switch]$Lista,
  [switch]$Reindexar,
  [switch]$SinCargar,
  [Alias('Jefe')][string]$JefeNpc,
  [string]$Repo = (Split-Path $PSScriptRoot -Parent)
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'duckdb.ps1')
$utf8 = New-Object Text.UTF8Encoding $false
$db = Join-Path $Repo 'db\aion.duckdb'

function Read-Json($p) { [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) | ConvertFrom-Json }
# PowerShell 5.1 serializa los valores vacíos de una tubería como {}: se guardan como null.
function Write-Json($p, $o) { [IO.File]::WriteAllText($p, ((ConvertTo-Json -InputObject $o -Depth 8 -Compress) -replace '":\{\}', '":null'), $utf8) }
function FromMs($ms) { [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$ms).ToLocalTime() }
function Slugify($s) {
  $n = $s.Normalize([Text.NormalizationForm]::FormD)
  $n = -join ($n.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' })
  ($n.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
}
# Filas de una consulta como objetos (DuckDB devuelve una columna JSON por fila)
function Query($sql) { @(Invoke-Duck $db $sql -SoloLectura | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json }) }

# Índice para la página principal: se reconstruye siempre a partir de las carpetas de raids
function Build-Index {
  $entradas = foreach ($dir in Get-ChildItem (Join-Path $Repo 'raids') -Directory) {
    $dp = Join-Path $dir.FullName 'data.json'; if (-not (Test-Path $dp)) { continue }
    $dd = Read-Json $dp
    $ap = Join-Path $dir.FullName 'analisis.json'
    $aa = if (Test-Path $ap) { Read-Json $ap } else { [pscustomobject]@{ pendiente = $true } }
    [pscustomobject]@{ slug = $dd.meta.slug; fecha = $dd.meta.fecha; jefe = $dd.meta.jefe; npc = $dd.meta.npc; mazmorra = $dd.meta.mazmorra
      intentos = $dd.resumen.intentos; matado = $dd.resumen.matado; mejor_pct = $dd.resumen.mejor_pct; muertes = $dd.resumen.muertes_grupo
      dps_grupo_medio = $dd.resumen.dps_grupo_medio; otros = @($dd.otros | Where-Object { $_ } | ForEach-Object { [pscustomobject]@{ npc = $_.npc; jefe = $_.jefe; matado = $_.matado } })
      analizado = -not [bool]$aa.pendiente }
  }
  Write-Json (Join-Path $Repo 'raids\index.json') @($entradas | Sort-Object fecha -Descending)
  # Perfiles de jugador (jugadores/) a partir de todas las raids
  & (Join-Path $PSScriptRoot 'perfiles.ps1') -Repo $Repo
}
if ($Reindexar) { Build-Index; Write-Host 'Indice reconstruido.'; return }

if (-not $SinCargar) { & (Join-Path $PSScriptRoot 'cargar-db.ps1') -Repo $Repo | Out-Host }
if (-not (Test-Path $db)) { throw 'No existe db\aion.duckdb: ejecuta antes tools\cargar-db.ps1' }

# Runs con encuentros: jefe principal = el npc con más intentos de más de 5 s (en empate, el último que se intentó)
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

$nombresPath = Join-Path $Repo 'nombres.json'
$nombres = if (Test-Path $nombresPath) { Read-Json $nombresPath } else { [pscustomobject]@{ npcs = @{}; habilidades = @{} } }
function NpcName($id) { $n = $nombres.npcs."$id"; if ($n) { $n } else { "Jefe $id" } }

$fecha = FromMs $run.entrada
$jefe = NpcName $mainNpc
$slug = '{0:yyyy-MM-dd-HHmm}-{1}' -f $fecha, (Slugify $jefe)
$dir = Join-Path $Repo "raids\$slug"
New-Item -ItemType Directory -Force $dir | Out-Null

# La raid entra en la tabla raids (cargar-web.sql la recargará luego desde el data.json) y db/raid.sql genera el JSON
Invoke-Duck $db @"
delete from raids where slug = $(Sql-Texto $slug);
insert into raids values ($(Sql-Texto $slug), $(Sql-Texto $run.id), $mainNpc, $(Sql-Texto $fecha.ToString('yyyy-MM-ddTHH:mm:sszzz'))::timestamptz, true);
set variable slug = $(Sql-Texto $slug);
set variable jefe = $(Sql-Texto $jefe);
set variable fecha = $(Sql-Texto $fecha.ToString('yyyy-MM-ddTHH:mm:sszzz'));
set variable extraido = $(Sql-Texto (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'));
.mode list
.headers off
.output $((Join-Path $dir 'data.json') -replace '\\', '/')
.read $((Join-Path $Repo 'db\raid.sql') -replace '\\', '/')
.output
"@ | Out-Null
$data = Read-Json (Join-Path $dir 'data.json')
if (-not $data.resumen.intentos) { throw "No salió ningún intento para $slug." }

Copy-Item (Join-Path $Repo 'assets\raid-shell.html') (Join-Path $dir 'index.html') -Force
$anaPath = Join-Path $dir 'analisis.json'
if (-not (Test-Path $anaPath)) { Write-Json $anaPath ([pscustomobject]@{ pendiente = $true; titular = ''; recomendaciones = @(); notas = @(); zonas = $null }) }

Build-Index

# Añade a nombres.json los npcs nuevos para poder ponerles nombre
$changed = $false
if (-not $nombres.npcs) { $nombres | Add-Member npcs ([pscustomobject]@{}) -Force }
foreach ($id in @([string]$mainNpc) + @($data.otros | Where-Object { $_ } | ForEach-Object { [string]$_.npc })) {
  if (-not ($nombres.npcs.PSObject.Properties.Name -contains $id)) { $nombres.npcs | Add-Member -NotePropertyName $id -NotePropertyValue ''; $changed = $true }
}
if ($changed) { [IO.File]::WriteAllText($nombresPath, ($nombres | ConvertTo-Json -Depth 4), $utf8) }

$r = $data.resumen
Write-Host ''
Write-Host "Raid extraida: $jefe ($('{0:dd/MM/yyyy HH:mm}' -f $fecha))"
Write-Host "  $($r.intentos) intentos, mejor $($r.mejor_pct) %, $(if ($r.matado) { 'MATADO' } else { 'sin kill' })"
Write-Host "  Carpeta: raids\$slug"
Write-Output $slug

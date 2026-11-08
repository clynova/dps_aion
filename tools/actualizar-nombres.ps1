<#
  Rellena nombres.json con los nombres en español de las habilidades y NPCs que aparecen en las raids,
  usando la misma fuente que la app de Questlog (questlog.gg, combatLog.entities).

  - "habilidades" y "npcs" se regeneran cada vez desde Questlog.
  - "apodos" se conserva: son nombres puestos a mano y tienen prioridad en la web
    (útil para los ataques del jefe que el juego llama solo «Ataque»).

  Uso: powershell -ExecutionPolicy Bypass -File tools\actualizar-nombres.ps1 [-Idioma es|en]
  Escribe nombres.json (es) o nombres.<idioma>.json.
#>
param([string]$Repo = (Split-Path $PSScriptRoot -Parent), [string]$Idioma = 'es')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$utf8 = New-Object Text.UTF8Encoding $false

function Get-Trpc($proc) {
  $in = [uri]::EscapeDataString((@{ language = $Idioma } | ConvertTo-Json -Compress))
  $r = Invoke-WebRequest "https://questlog.gg/aion-2/api/trpc/$proc`?input=$in" -UseBasicParsing -TimeoutSec 60
  # La respuesta no declara charset: se decodifica como UTF-8 a mano para no romper las tildes.
  $bytes = $r.RawContentStream.ToArray()
  ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json).result.data
}

# IDs que usan las raids guardadas (publicadas y privadas)
$skIds = @{}; $npcIds = @{}
$files = @(Get-ChildItem (Join-Path $Repo 'raids') -Recurse -Filter data.json -ErrorAction SilentlyContinue) +
         @(Get-ChildItem (Join-Path $Repo '_privado') -Recurse -Filter data.json -ErrorAction SilentlyContinue)
foreach ($f in $files) {
  $d = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $addSk = { param($id) if ($id) { $skIds[[string]$id] = 1 } }
  $addNpc = { param($id) if ([string]$id -match '^\d+$') { $npcIds[[string]$id] = 1 } }
  & $addNpc $d.meta.npc
  $d.otros | ForEach-Object { & $addNpc $_.npc }
  $d.causas | ForEach-Object { & $addSk $_.habilidad; & $addNpc $_.origen }
  $d.casteos | ForEach-Object { & $addSk $_.habilidad }
  $d.intentos | ForEach-Object { & $addSk $_.ultima_causa }
  foreach ($p in $d.detalle.PSObject.Properties) {
    $p.Value.habilidades | ForEach-Object { & $addSk $_.habilidad }
    $p.Value.recibido | ForEach-Object { & $addSk $_.habilidad }
    $p.Value.muertes | ForEach-Object { & $addSk $_.habilidad; & $addNpc $_.origen }
  }
}

Write-Host "Descargando nombres de Questlog ($Idioma)..."
$S = Get-Trpc 'combatLog.entities.skills'
$N = (Get-Trpc 'combatLog.entities.names').npc

# Textos propios por idioma: nombre genérico del juego para los golpes de NPC y etiquetas de las zonas.
$L = @{
  es = @{ generic = 'Ataque'; zone = 'Zona'; curse = 'Zona de maldición'; summon = 'Zona invocada' }
  en = @{ generic = 'Attack'; zone = 'Zone'; curse = 'Curse zone'; summon = 'Summoned zone' }
}[$Idioma]
if (-not $L) { throw "Idioma no soportado: $Idioma" }

# Las invocaciones invisibles son zonas de daño de una habilidad del jefe, no enemigos.
function Pretty-Npc($raw) {
  if ($raw -match '^N_Invisible_Summon_.*?(Skill)_?(\d+)(?:_(\d+))?') {
    $n = [int]$Matches[2]; $sub = if ($Matches[3]) { "-$([int]$Matches[3])" } else { '' }
    return "$($L.zone) $n$sub"
  }
  if ($raw -match '^N_Invisible_Summon_.*_Curse') { return $L.curse }
  if ($raw -match '^N_Invisible_Summon_') { return $L.summon }
  return $raw
}

$habilidades = [ordered]@{}
$iconos = [ordered]@{}
foreach ($id in ($skIds.Keys | Sort-Object { [int64]$_ })) {
  $name = $S.$id.name
  if (-not $name) { continue }
  if ($name -eq $L.generic) { $name = "$($L.generic) $id" }   # nombre genérico del juego: se distingue por su número
  $habilidades[$id] = $name
  # Icono: ruta corta bajo Texture/, sin el sufijo ".NOMBRE". Las habilidades de NPC llevan un icono
  # de relleno (ICON_TE_SKILL_001) que no las representa: esas se quedan sin icono.
  $icon = ([string]$S.$id.icon) -replace '^/assets/Game/UI/Resource/Texture/', '' -replace '\.[^./]+$', ''
  if ($icon -and -not ($icon -eq 'Skill/ICON_TE_SKILL_001' -and $id.Length -lt 8)) { $iconos[$id] = $icon }
}
$npcs = [ordered]@{}
foreach ($id in ($npcIds.Keys | Sort-Object { [int64]$_ })) { $raw = $N.$id.name; if ($raw) { $npcs[$id] = Pretty-Npc $raw } }

$path = Join-Path $Repo $(if ($Idioma -eq 'es') { 'nombres.json' } else { "nombres.$Idioma.json" })
$prev = if (Test-Path $path) { [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null }
$apodos = if ($prev -and $prev.apodos) { $prev.apodos } else { [pscustomobject]@{} }
$out = [ordered]@{
  fuente = 'questlog.gg (combatLog.entities), idioma ' + $Idioma
  actualizado = (Get-Date).ToString('yyyy-MM-dd')
  apodos = $apodos
  npcs = $npcs
  habilidades = $habilidades
  iconos = $iconos
}
[IO.File]::WriteAllText($path, ($out | ConvertTo-Json -Depth 4), $utf8)
$sinNombre = @($skIds.Keys | Where-Object { -not $habilidades.Contains($_) })
Write-Host "$(Split-Path $path -Leaf): $($habilidades.Count) habilidades ($($iconos.Count) con icono) y $($npcs.Count) NPCs. Sin nombre: $($sinNombre.Count)"

<#
  Extrae una raid del medidor de Questlog (Aion 2) y la guarda en raids/<slug>/.

  Uso:
    powershell -ExecutionPolicy Bypass -File tools\extraer-raid.ps1            # la última raid
    powershell -ExecutionPolicy Bypass -File tools\extraer-raid.ps1 -Run 656c  # una run concreta (inicio del id)
    ... -Lista                                                                  # ver las últimas runs
    ... -Run dc39 -Jefe 2301006                                                 # una run, centrada en un jefe concreto

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
  [Alias('Jefe')][string]$JefeNpc,
  [string]$Repo = (Split-Path $PSScriptRoot -Parent)
)
$ErrorActionPreference = 'Stop'
$d = "$env:APPDATA\Questlog\aion-2"
if (-not (Test-Path "$d\runs\index.json")) { throw "No encuentro los datos de Questlog en $d" }
$utf8 = New-Object Text.UTF8Encoding $false

function Read-Json($p) { [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) | ConvertFrom-Json }
# PowerShell 5.1 serializa los valores vacíos de una tubería como {}: se guardan como null.
function Write-Json($p, $o) { [IO.File]::WriteAllText($p, ((ConvertTo-Json -InputObject $o -Depth 8 -Compress) -replace '":\{\}', '":null'), $utf8) }
function Read-Gz($p) {
  $fs = [IO.File]::OpenRead($p)
  $gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
  $sr = New-Object IO.StreamReader($gz); $t = $sr.ReadToEnd(); $sr.Close(); $t
}
function Unpack($col) {
  $v = $col.values
  if ($col.kind -ne 'times') { return $v }
  $r = New-Object 'double[]' $v.Count; $acc = 0.0
  for ($i = 0; $i -lt $v.Count; $i++) { $acc += [double]$v[$i]; $r[$i] = $acc }
  return $r
}
function FromMs($ms) { [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$ms).ToLocalTime() }
function Slugify($s) {
  $n = $s.Normalize([Text.NormalizationForm]::FormD)
  $n = -join ($n.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' })
  ($n.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
}

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
$runs = (Read-Json "$d\runs\index.json").entries | Sort-Object enteredAt -Descending
if ($Lista) {
  $runs | Select-Object -First 15 | ForEach-Object {
    '{0}  {1:yyyy-MM-dd HH:mm}  mazmorra {2}  jefe {3}  encuentros {4}  jugadores {5}' -f $_.id.Substring(0, 8), (FromMs $_.enteredAt), $_.dungeon, $_.boss, $_.encounters, $_.players
  }
  return
}
$run = if ($RunId) { $runs | Where-Object { $_.id -like "$RunId*" } | Select-Object -First 1 } else { $runs | Where-Object { $_.encounters -gt 0 } | Select-Object -First 1 }
if (-not $run) { throw 'No encuentro esa run.' }
$runFile = Read-Json "$d\runs\$($run.id).json"

$nombresPath = Join-Path $Repo 'nombres.json'
$nombres = if (Test-Path $nombresPath) { Read-Json $nombresPath } else { [pscustomobject]@{ npcs = @{}; habilidades = @{} } }
function NpcName($id) { $n = $nombres.npcs."$id"; if ($n) { $n } else { "Jefe $id" } }

$all = (Read-Json "$d\encounters\index.json").entries | Where-Object { $_.log -eq $run.log } | Sort-Object startedAt
$all = $all | Where-Object { Test-Path "$d\encounters\$($_.id).json.gz" }
if (-not $all) { throw 'Esta run no tiene encuentros guardados.' }
$real = $all | Where-Object { $_.durationSeconds -gt 5 }
# Jefe principal: el que más intentos tiene (en empate, el último que se intentó).
$mainNpc = ($real | Group-Object npc | Sort-Object @{ e = { $_.Count }; Descending = $true }, @{ e = { ($_.Group | Measure-Object startedAt -Maximum).Maximum }; Descending = $true } | Select-Object -First 1).Name
if ($JefeNpc) { if (-not ($real | Where-Object { [string]$_.npc -eq $JefeNpc })) { throw "Esa run no tiene intentos al jefe $JefeNpc." }; $mainNpc = $JefeNpc }
$idx = $real | Where-Object { [string]$_.npc -eq $mainNpc }
$otros = $real | Where-Object { [string]$_.npc -ne $mainNpc } | Group-Object npc | ForEach-Object {
  $k = $_.Group | Where-Object killed | Sort-Object durationSeconds | Select-Object -First 1
  [pscustomobject]@{ npc = [int]$_.Name; jefe = (NpcName $_.Name); intentos = $_.Count; matado = [bool]$k
    kill_s = if ($k) { [math]::Round($k.durationSeconds) } else { $null }; dps_raid = if ($k) { [math]::Round($k.dps) } else { [math]::Round(($_.Group | Measure-Object dps -Maximum).Maximum) } }
}

$self = $runFile.character
$fights = @()
foreach ($e in $idx) { $fights += [pscustomobject]@{ e = $e; fi = ((Read-Gz "$d\encounters\$($e.id).json.gz") | ConvertFrom-Json).fight } }

# Grupo: jugadores de tu grupo que hicieron algo (el medidor solo cuenta tu grupo).
$partyDmg = @{}
foreach ($f in $fights) {
  $ent = @{}; foreach ($p in $f.fi.players) { if ($p.party -or $p.self) { $ent[[string]$p.entity] = $p.name } }
  $h = $f.fi.packed.hits.columns
  if ($f.fi.packed.hits.length -gt 0) { $own = Unpack $h.owner; $dmg = Unpack $h.damage; for ($i = 0; $i -lt $own.Count; $i++) { $n = $ent[[string]$own[$i]]; if ($n) { $partyDmg[$n] = [double]$partyDmg[$n] + $dmg[$i] } } }
}
$party = @($partyDmg.Keys | Where-Object { $partyDmg[$_] -gt 0 })
if ($party -notcontains $self) { $party += $self }

$clases = @{ templar = 'Templario'; assassin = 'Asesino'; elementalist = 'Espiritualista'; cleric = 'Clérigo'; sorcerer = 'Hechicero'; gladiator = 'Gladiador'; ranger = 'Arquero'; chanter = 'Cantor'; fighter = 'Luchador' }
$intentos = @(); $dpsRows = @(); $curva = @(); $casts = @(); $deathRows = @(); $plAgg = @{}
$detSk = @{}; $detTk = @{}; $detDe = @()
$n = 0; $bossMaxHp = 0; $killS = $null
foreach ($f in $fights) {
  $n++; $e = $f.e; $fi = $f.fi
  $start = [double]$fi.startedAt; $dur = [double]$e.durationSeconds
  $boss = $fi.npcs | Where-Object { $_.boss } | Sort-Object damage -Descending | Select-Object -First 1
  $bossMaxHp = [math]::Max($bossMaxHp, [double]$boss.maxHp)
  $ent = @{}; foreach ($p in $fi.players) { if ($party -contains $p.name) { $ent[[string]$p.entity] = $p } }
  $acc = @{}; foreach ($k in $ent.Keys) { $acc[$k] = @{ dmg = 0.0; heal = 0.0; taken = 0.0; hits = 0; crit = 0; back = 0 } }
  $h = $fi.packed.hits.columns
  $hat = Unpack $h.at; $own = Unpack $h.owner; $tgt = Unpack $h.target; $dmg = Unpack $h.damage; $cr = Unpack $h.critical; $bk = Unpack $h.back; $hsk = Unpack $h.skill
  $cum = 0.0; $marks = [ordered]@{}
  for ($i = 0; $i -lt $own.Count; $i++) {
    if ($tgt[$i] -ne $boss.entity) { continue }
    $cum += $dmg[$i]
    $pct = [math]::Floor(100 * $cum / $boss.maxHp / 5) * 5
    if ($pct -ge 5 -and -not $marks.Contains([string]$pct)) { $marks[[string]$pct] = [math]::Round(($hat[$i] - $start) / 1000, 1) }
    $k = [string]$own[$i]; if (-not $acc.ContainsKey($k)) { continue }
    $a = $acc[$k]; $a.dmg += $dmg[$i]; $a.hits++; if ($cr[$i]) { $a.crit++ }; if ($bk[$i]) { $a.back++ }
    $nm = $ent[$k].name; $sk = [string]$hsk[$i]
    if (-not $detSk.ContainsKey($nm)) { $detSk[$nm] = @{} }
    if (-not $detSk[$nm].ContainsKey($sk)) { $detSk[$nm][$sk] = @{ dano = 0.0; golpes = 0; crit = 0 } }
    $s = $detSk[$nm][$sk]; $s.dano += $dmg[$i]; $s.golpes++; if ($cr[$i]) { $s.crit++ }
  }
  $bp = if ($e.killed) { 100 } else { [math]::Round(100 * $boss.damage / $boss.maxHp, 1) }
  if ($e.killed -and $null -eq $killS) { $killS = [math]::Round($dur) }
  $curva += [pscustomobject]@{ intento = $n; t = 0; progreso = 0 }
  foreach ($m in $marks.Keys) { if ([int]$m -lt $bp) { $curva += [pscustomobject]@{ intento = $n; t = $marks[$m]; progreso = [int]$m } } }
  $curva += [pscustomobject]@{ intento = $n; t = [math]::Round($dur, 1); progreso = $bp }
  if ($fi.packed.heals.length -gt 0) { $hh = $fi.packed.heals.columns; $o = Unpack $hh.owner; $am = Unpack $hh.amount; for ($i = 0; $i -lt $o.Count; $i++) { $k = [string]$o[$i]; if ($acc.ContainsKey($k)) { $acc[$k].heal += $am[$i] } } }
  $tat = @(); $ttg = @(); $tdm = @()
  if ($fi.packed.taken.length -gt 0) {
    $t = $fi.packed.taken.columns; $tat = Unpack $t.at; $ttg = Unpack $t.target; $tdm = Unpack $t.damage; $tsk = Unpack $t.skill
    for ($i = 0; $i -lt $ttg.Count; $i++) {
      $k = [string]$ttg[$i]; if (-not $acc.ContainsKey($k)) { continue }
      $acc[$k].taken += $tdm[$i]
      $nm = $ent[$k].name; $sk = [string]$tsk[$i]
      if (-not $detTk.ContainsKey($nm)) { $detTk[$nm] = @{} }
      if (-not $detTk[$nm].ContainsKey($sk)) { $detTk[$nm][$sk] = @{ dano = 0.0; golpes = 0; max = 0.0 } }
      $s = $detTk[$nm][$sk]; $s.dano += $tdm[$i]; $s.golpes++; if ($tdm[$i] -gt $s.max) { $s.max = $tdm[$i] }
    }
  }
  $byName = @{}; foreach ($p in $fi.players) { $byName[$p.name] = $p.entity }
  $pd = @{}; $lastSkill = $null; $partyDeaths = 0
  foreach ($x in $fi.mechanics.deaths) {
    $at = [double]$x.at; if ($at -lt $start -or $party -notcontains $x.name) { continue }
    $partyDeaths++; $pd[$x.name] = 1 + [int]$pd[$x.name]
    $id = $byName[$x.name]; $max = 0.0
    if ($null -ne $id) { for ($i = 0; $i -lt $tat.Count; $i++) { if ($ttg[$i] -eq $id -and $tat[$i] -le $at + 50 -and $tat[$i] -ge $at - 5000 -and $tdm[$i] -gt $max) { $max = $tdm[$i] } } }
    $origen = if ([string]$x.npc -eq $mainNpc) { 'jefe' } elseif ($x.npc) { [string]$x.npc } else { '' }
    $deathRows += [pscustomobject]@{ skill = $(if ($x.skill) { [string]$x.skill } else { '' }); origen = $origen; max = $max }
    $detDe += [pscustomobject]@{ jugador = $x.name; intento = $n; t = [math]::Round(($at - $start) / 1000); habilidad = $(if ($x.skill) { [string]$x.skill } else { '' }); origen = $origen; golpe_max = [math]::Round($max) }
    if ($x.skill) { $lastSkill = [string]$x.skill }
  }
  $breakT = @($fi.mechanics.breaks | ForEach-Object { [math]::Round(([double]$_.at - $start) / 1000) }) | Select-Object -First 1
  $groupDps = 0.0
  foreach ($k in $acc.Keys) {
    $p = $ent[$k]; $a = $acc[$k]; $groupDps += $a.dmg / $dur
    $dpsRows += [pscustomobject]@{ intento = $n; jugador = $p.name; dps = [math]::Round($a.dmg / $dur); muertes = [int]$pd[$p.name] }
    if (-not $plAgg.ContainsKey($p.name)) { $plAgg[$p.name] = @{ clase = $p.class; gs = $p.gearScore; cp = $p.combatPower; dmg = 0.0; heal = 0.0; taken = 0.0; t = 0.0; hits = 0; crit = 0; back = 0; deaths = 0 } }
    $g = $plAgg[$p.name]; $g.dmg += $a.dmg; $g.heal += $a.heal; $g.taken += $a.taken; $g.t += $dur; $g.hits += $a.hits; $g.crit += $a.crit; $g.back += $a.back; $g.deaths += [int]$pd[$p.name]
  }
  $intentos += [pscustomobject]@{ intento = $n; duracion_s = [math]::Round($dur); progreso_pct = $bp; matado = [bool]$e.killed; dps_grupo = [math]::Round($groupDps); muertes = $partyDeaths; rotura_s = $breakT; ultima_causa = $lastSkill }
  foreach ($c in @($fi.mechanics.castBars) + @($fi.mechanics.telegraphs)) {
    if ($null -eq $c -or [string]$c.npc -ne $mainNpc) { continue }
    $tt = [math]::Round(([double]$c.at - $start) / 1000, 1); if ($tt -lt 0) { continue }
    $casts += [pscustomobject]@{ intento = $n; t = $tt; habilidad = [string]$c.skill }
  }
}

$jugadores = foreach ($k in $plAgg.Keys) {
  $g = $plAgg[$k]
  [pscustomobject]@{ jugador = $k; clase = $(if ($clases[$g.clase]) { $clases[$g.clase] } else { $g.clase }); clase_id = $g.clase; gs = $g.gs; cp = $g.cp
    dps = [math]::Round($g.dmg / $g.t); hps = [math]::Round($g.heal / $g.t); dano_recibido = [math]::Round($g.taken); muertes = $g.deaths
    crit_pct = $(if ($g.hits) { [math]::Round(100 * $g.crit / $g.hits, 1) } else { 0 }); espalda_pct = $(if ($g.hits) { [math]::Round(100 * $g.back / $g.hits, 1) } else { 0 }) }
}
$causas = @($deathRows | Group-Object skill, origen | ForEach-Object {
  [pscustomobject]@{ habilidad = $_.Group[0].skill; origen = $_.Group[0].origen; muertes = $_.Count; golpe_max = [math]::Round(($_.Group | Measure-Object max -Maximum).Maximum) }
} | Sort-Object @{ e = { $_.muertes }; Descending = $true })

$fecha = FromMs $run.enteredAt
$jefe = NpcName $mainNpc
$slug = '{0:yyyy-MM-dd-HHmm}-{1}' -f $fecha, (Slugify $jefe)
$best = $intentos | Sort-Object @{ e = { $_.progreso_pct }; Descending = $true }, intento | Select-Object -First 1
$resumen = [pscustomobject]@{
  intentos = $intentos.Count
  matado = [bool]($intentos | Where-Object matado)
  kill_s = $killS
  minutos_combate = [math]::Round((($intentos | Measure-Object duracion_s -Sum).Sum) / 60, 1)
  mejor_pct = $best.progreso_pct
  mejor_intento = $best.intento
  muertes_grupo = [int](($intentos | Measure-Object muertes -Sum).Sum)
  dps_grupo_medio = [math]::Round(($intentos | Measure-Object dps_grupo -Average).Average)
  hp_jefe = $bossMaxHp
}
$meta = [pscustomobject]@{
  slug = $slug; run = $run.id; fecha = $fecha.ToString('yyyy-MM-ddTHH:mm:sszzz'); mazmorra = $run.dungeon
  jefe = $jefe; npc = [int]$mainNpc; personaje = $self; grupo = @($party | Sort-Object)
  run_min = [math]::Round(([double]$runFile.leftAt - [double]$run.enteredAt) / 60000, 1); limite_min = $(if ($runFile.limitMs) { [math]::Round($runFile.limitMs / 60000) } else { $null })
  reseteos = @($all | Where-Object { [string]$_.npc -eq $mainNpc -and $_.durationSeconds -le 5 }).Count
  extraido = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
}
# Ficha de cada jugador: habilidades con las que hace daño, qué le hace daño y sus muertes
$detalle = [ordered]@{}
foreach ($nm in $plAgg.Keys) {
  $tot = [math]::Max(1, $plAgg[$nm].dmg)
  $sks = @(); if ($detSk[$nm]) { $sks = @($detSk[$nm].GetEnumerator() | Sort-Object { -$_.Value.dano } | Select-Object -First 12 | ForEach-Object {
    [pscustomobject]@{ habilidad = $_.Key; dano = [math]::Round($_.Value.dano); pct = [math]::Round(100 * $_.Value.dano / $tot, 1); golpes = $_.Value.golpes; crit_pct = [math]::Round(100 * $_.Value.crit / [math]::Max(1, $_.Value.golpes), 1) } }) }
  $tks = @(); if ($detTk[$nm]) { $tks = @($detTk[$nm].GetEnumerator() | Sort-Object { -$_.Value.dano } | Select-Object -First 8 | ForEach-Object {
    [pscustomobject]@{ habilidad = $_.Key; dano = [math]::Round($_.Value.dano); golpes = $_.Value.golpes; golpe_max = [math]::Round($_.Value.max) } }) }
  $detalle[$nm] = [pscustomobject]@{ habilidades = $sks; recibido = $tks; muertes = @($detDe | Where-Object { $_.jugador -eq $nm } | Select-Object intento, t, habilidad, origen, golpe_max) }
}
$data = [pscustomobject]@{ meta = $meta; resumen = $resumen; otros = @($otros); intentos = $intentos; curva = $curva; jugadores = @($jugadores | Sort-Object @{ e = { $_.dps }; Descending = $true }); dps_intento = $dpsRows; causas = $causas; casteos = $casts; detalle = [pscustomobject]$detalle }

$dir = Join-Path $Repo "raids\$slug"
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item (Join-Path $Repo 'assets\raid-shell.html') (Join-Path $dir 'index.html') -Force
Write-Json (Join-Path $dir 'data.json') $data
$anaPath = Join-Path $dir 'analisis.json'
if (-not (Test-Path $anaPath)) { Write-Json $anaPath ([pscustomobject]@{ pendiente = $true; titular = ''; recomendaciones = @(); notas = @(); zonas = $null }) }
$ana = Read-Json $anaPath

Build-Index

# Añade a nombres.json los npcs nuevos para poder ponerles nombre
$changed = $false
if (-not $nombres.npcs) { $nombres | Add-Member npcs ([pscustomobject]@{}) -Force }
foreach ($id in @([string]$mainNpc) + @($otros | ForEach-Object { [string]$_.npc })) {
  if (-not ($nombres.npcs.PSObject.Properties.Name -contains $id)) { $nombres.npcs | Add-Member -NotePropertyName $id -NotePropertyValue ''; $changed = $true }
}
if ($changed) { [IO.File]::WriteAllText($nombresPath, ($nombres | ConvertTo-Json -Depth 4), $utf8) }

Write-Host ''
Write-Host "Raid extraida: $jefe ($('{0:dd/MM/yyyy HH:mm}' -f $fecha))"
Write-Host "  $($resumen.intentos) intentos, mejor $($resumen.mejor_pct) %, $(if ($resumen.matado) { 'MATADO' } else { 'sin kill' })"
Write-Host "  Carpeta: raids\$slug"
Write-Output $slug

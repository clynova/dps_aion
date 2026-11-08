<#
  Construye los perfiles de jugador a partir de todas las raids publicadas (raids/*/data.json).

  Crea o actualiza:
    jugadores/index.json             listado para la portada
    jugadores/<slug>/data.json       métricas del jugador en cada raid y acumuladas
    jugadores/<slug>/index.html      copia de assets/jugador-shell.html
  No toca perfil.json / perfil.en.json (el texto que escribe Claude).

  Uso: powershell -ExecutionPolicy Bypass -File tools\perfiles.ps1
#>
param([string]$Repo = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$utf8 = New-Object Text.UTF8Encoding $false
function Read-Json($p) { [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) | ConvertFrom-Json }
function Write-Json($p, $o) { [IO.File]::WriteAllText($p, ((ConvertTo-Json -InputObject $o -Depth 8 -Compress) -replace '":\{\}', '":null'), $utf8) }
function Slugify($s) {
  $n = $s.Normalize([Text.NormalizationForm]::FormD)
  $n = -join ($n.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' })
  ($n.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
}
# Media de la primera muerte de cada intento en que murió (segundos); $null si nunca murió
function FirstDeathAvg($muertes) {
  $m = @($muertes); if (-not $m.Count) { return $null }
  [math]::Round((($m | Group-Object intento | ForEach-Object { ($_.Group | Measure-Object t -Minimum).Minimum }) | Measure-Object -Average).Average)
}

# Suma de los valores de un objeto {clave: número} (mitigados, evitados)
function SumProps($o) { if (-not $o) { return 0 }; [double](($o.PSObject.Properties | Measure-Object Value -Sum).Sum) }
function Avg($xs) { $v = @($xs | Where-Object { $null -ne $_ }); if ($v.Count) { [math]::Round(($v | Measure-Object -Average).Average, 1) } else { $null } }
# Apoyo y supervivencia de un jugador en una raid (solo raids extraídas con db/raid.sql desde el 8/11; antes, $null)
function Support($name, $det) {
  $ap = $det.apoyo; if (-not $ap) { return $null }
  $self = @($ap.cura_obj | Where-Object { $_.jugador -eq $name } | ForEach-Object { [double]$_.cantidad }) | Measure-Object -Sum
  [pscustomobject]@{ curacion = $ap.curacion; escudos = $ap.escudos; absorbido = $ap.absorbido
    propia_pct = $(if ($ap.curacion) { [math]::Round(100 * $self.Sum / $ap.curacion, 1) } else { 0 }) }
}
function Survival($det) {
  $sv = $det.supervivencia; if (-not $sv) { return $null }
  $mit = SumProps $sv.mitigados
  $ms = @($det.muertes)
  [pscustomobject]@{ golpes = $sv.golpes; mitigados = $mit; mitigados_pct = $(if ($sv.golpes) { [math]::Round(100 * $mit / $sv.golpes, 1) } else { 0 })
    evitados = SumProps $sv.evitados; cura_recibida = $sv.cura_recibida; escudo_recibido = $sv.escudo_recibido
    resurrecciones = $sv.resurrecciones; bajo30_pct = $sv.bajo30_pct
    muertes_rapidas = @($ms | Where-Object { $null -ne $_.vida_5s -and $_.vida_5s -ge 70 }).Count
    vida_5s_media = Avg ($ms | ForEach-Object { $_.vida_5s }) }
}

function Rotation($det) {
  $ro = $det.rotacion; if (-not $ro) { return $null }
  [pscustomobject]@{ usos = $ro.usos; vivo_s = $ro.vivo_s; usos_min = $ro.usos_min; pausas_pct = $ro.pausas_pct; primer_golpe_s = $ro.primer_golpe_s }
}

$players = @{}   # nombre -> @{ raids = list; skills = @{}; causes = @{}; heals = @{}; healTo = @{}; mit = @{}; evi = @{}; deaths = list; casts = @{}; buffs = @{} }
$raidDirs = Get-ChildItem (Join-Path $Repo 'raids') -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'data.json') }
foreach ($dir in $raidDirs) {
  $d = Read-Json (Join-Path $dir.FullName 'data.json')
  $js = @($d.jugadores)
  $n = [double]$d.resumen.intentos
  $fds = @{}; foreach ($j in $js) { $fds[$j.jugador] = FirstDeathAvg $d.detalle.($j.jugador).muertes }
  $fdVals = @($fds.Values | Where-Object { $null -ne $_ })
  $grp = [pscustomobject]@{
    dps = [math]::Round(($js | Measure-Object dps -Average).Average)
    hps = [math]::Round(($js | Measure-Object hps -Average).Average)
    muertes_intento = [math]::Round(($js | Measure-Object muertes -Average).Average / [math]::Max(1, $n), 2)
    dano_recibido = [math]::Round(($js | Measure-Object dano_recibido -Average).Average)
    primera_muerte = $(if ($fdVals.Count) { [math]::Round(($fdVals | Measure-Object -Average).Average) } else { $null })
  }
  $rank = @($js | Sort-Object dps -Descending | ForEach-Object { $_.jugador })
  $svs = @{}; foreach ($j in $js) { $svs[$j.jugador] = Survival $d.detalle.($j.jugador) }
  $hasSv = @($svs.Values | Where-Object { $_ }).Count -gt 0
  $ros = @{}; foreach ($j in $js) { $ros[$j.jugador] = Rotation $d.detalle.($j.jugador) }
  if ($hasSv) {
    $grp | Add-Member mitigados_pct (Avg ($svs.Values | ForEach-Object { $_.mitigados_pct }))
    $grp | Add-Member bajo30_pct (Avg ($svs.Values | ForEach-Object { $_.bajo30_pct }))
  }
  $rotKeys = 'usos_min', 'pausas_pct', 'primer_golpe_s'
  if (@($ros.Values | Where-Object { $_ }).Count) { foreach ($k in $rotKeys) { $grp | Add-Member $k (Avg ($ros.Values | Where-Object { $_ } | ForEach-Object { $_.$k })) } }
  foreach ($j in $js) {
    $name = $j.jugador
    if (-not $players.ContainsKey($name)) { $players[$name] = @{ raids = New-Object System.Collections.ArrayList; skills = @{}; causes = @{}
      heals = @{}; healTo = @{}; mit = @{}; evi = @{}; deaths = New-Object System.Collections.ArrayList; casts = @{}; buffs = @{}; vivo = 0.0 } }
    # Media de su clase en esta raid (incluido él): con quién compararse
    $mates = @($js | Where-Object { $_.clase_id -eq $j.clase_id })
    $cls = [pscustomobject]@{ jugadores = $mates.Count
      dps = [math]::Round(($mates | Measure-Object dps -Average).Average); hps = [math]::Round(($mates | Measure-Object hps -Average).Average)
      muertes_intento = [math]::Round(($mates | Measure-Object muertes -Average).Average / [math]::Max(1, $n), 2) }
    if ($hasSv) {
      $cls | Add-Member mitigados_pct (Avg ($mates | ForEach-Object { $svs[$_.jugador].mitigados_pct }))
      $cls | Add-Member bajo30_pct (Avg ($mates | ForEach-Object { $svs[$_.jugador].bajo30_pct }))
    }
    if ($ros[$name]) { foreach ($k in $rotKeys) { $cls | Add-Member $k (Avg ($mates | Where-Object { $ros[$_.jugador] } | ForEach-Object { $ros[$_.jugador].$k })) } }
    $p = $players[$name]
    $det = $d.detalle.$name
    [void]$p.raids.Add([pscustomobject]@{
      slug = $d.meta.slug; fecha = $d.meta.fecha; npc = $d.meta.npc; jefe = $d.meta.jefe; matado = [bool]$d.resumen.matado
      intentos = $d.resumen.intentos; mejor_pct = $d.resumen.mejor_pct; grupo = $d.meta.grupo.Count
      clase_id = $j.clase_id; gs = $j.gs; cp = $j.cp
      dps = $j.dps; hps = $j.hps; dano_recibido = $j.dano_recibido; muertes = $j.muertes
      muertes_intento = [math]::Round($j.muertes / [math]::Max(1, $n), 2)
      primera_muerte = $fds[$name]; crit_pct = $j.crit_pct; espalda_pct = $j.espalda_pct
      puesto_dps = [array]::IndexOf($rank, $name) + 1
      grupo_media = $grp; clase_media = $cls
      top = @($det.habilidades | Select-Object -First 3 | ForEach-Object { [pscustomobject]@{ habilidad = $_.habilidad; pct = $_.pct } })
      apoyo = Support $name $det; supervivencia = $svs[$name]; rotacion = $ros[$name]
    })
    if ($det.rotacion) {
      $p.vivo += [double]$det.rotacion.vivo_s
      foreach ($c in @($det.rotacion.usos_hab)) {
        if (-not $p.casts.ContainsKey($c.habilidad)) { $p.casts[$c.habilidad] = @{ usos = 0.0; int = 0.0 } }
        $e = $p.casts[$c.habilidad]; $e.usos += [double]$c.usos; $e.int += [double]$c.usos * [double]$c.intervalo_s   # intervalo medio ponderado por usos
      }
      foreach ($b in @($det.rotacion.buffs)) {
        if (-not $p.buffs.ContainsKey($b.habilidad)) { $p.buffs[$b.habilidad] = New-Object System.Collections.ArrayList }
        [void]$p.buffs[$b.habilidad].Add([double]$b.activo_pct)
      }
    }
    foreach ($s in @($det.habilidades)) { $p.skills[$s.habilidad] = [double]$p.skills[$s.habilidad] + [double]$s.dano }
    if ($det.apoyo) {
      foreach ($h in @($det.apoyo.cura_hab)) { $p.heals[$h.habilidad] = [double]$p.heals[$h.habilidad] + [double]$h.cantidad }
      foreach ($o in @($det.apoyo.cura_obj)) { $p.healTo[$o.jugador] = [double]$p.healTo[$o.jugador] + [double]$o.cantidad }
    }
    if ($det.supervivencia) {
      foreach ($k in @($det.supervivencia.mitigados.PSObject.Properties)) { $p.mit[$k.Name] = [double]$p.mit[$k.Name] + [double]$k.Value }
      foreach ($k in @($det.supervivencia.evitados.PSObject.Properties)) { $p.evi[$k.Name] = [double]$p.evi[$k.Name] + [double]$k.Value }
      foreach ($m in @($det.muertes)) { if ($null -ne $m.vida_5s) {
        [void]$p.deaths.Add([pscustomobject]@{ slug = $d.meta.slug; fecha = $d.meta.fecha; intento = $m.intento; t = $m.t; habilidad = $m.habilidad
          origen = $m.origen; golpe_max = $m.golpe_max; vida_5s = $m.vida_5s; vida_1s = $m.vida_1s; dano_5s = $m.dano_5s; cura_5s = $m.cura_5s }) } }
    }
    foreach ($m in @($det.muertes)) {
      $k = "$($m.habilidad)|$($m.origen)"
      if (-not $p.causes.ContainsKey($k)) { $p.causes[$k] = @{ habilidad = $m.habilidad; origen = $m.origen; n = 0; max = 0 } }
      $c = $p.causes[$k]; $c.n++; if ([double]$m.golpe_max -gt $c.max) { $c.max = [double]$m.golpe_max }
    }
  }
}

$base = Join-Path $Repo 'jugadores'
New-Item -ItemType Directory -Force $base | Out-Null
$shell = Join-Path $Repo 'assets\jugador-shell.html'
$index = foreach ($name in ($players.Keys | Sort-Object)) {
  $p = $players[$name]
  $raids = @($p.raids | Sort-Object fecha)
  $last = $raids[-1]
  $slug = Slugify $name
  $totSk = [math]::Max(1, ($p.skills.Values | Measure-Object -Sum).Sum)
  $skills = @($p.skills.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 | ForEach-Object {
    [pscustomobject]@{ habilidad = $_.Key; dano = [math]::Round($_.Value); pct = [math]::Round(100 * $_.Value / $totSk, 1) } })
  $causes = @($p.causes.Values | Sort-Object { -$_.n } | Select-Object -First 8 | ForEach-Object {
    [pscustomobject]@{ habilidad = $_.habilidad; origen = $_.origen; muertes = $_.n; golpe_max = [math]::Round($_.max) } })
  $totHeal = [math]::Max(1, ($p.heals.Values | Measure-Object -Sum).Sum)
  $totTo = [math]::Max(1, ($p.healTo.Values | Measure-Object -Sum).Sum)
  $conDatos = @($raids | Where-Object { $_.supervivencia }).Count
  $apoyo = if ($conDatos) { [pscustomobject]@{
    raids = $conDatos
    cura_hab = @($p.heals.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 | ForEach-Object {
      [pscustomobject]@{ habilidad = $_.Key; cantidad = [math]::Round($_.Value); pct = [math]::Round(100 * $_.Value / $totHeal, 1) } })
    cura_obj = @($p.healTo.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
      [pscustomobject]@{ jugador = $_.Key; cantidad = [math]::Round($_.Value); pct = [math]::Round(100 * $_.Value / $totTo, 1) } })
  } } else { $null }
  $superv = if ($conDatos) { [pscustomobject]@{
    raids = $conDatos
    mitigados = [pscustomobject]$p.mit; evitados = [pscustomobject]$p.evi
    muertes = @($p.deaths | Sort-Object fecha, intento, t -Descending | Select-Object -First 20)
  } } else { $null }
  $conRot = @($raids | Where-Object { $_.rotacion }).Count
  $rotacion = if ($conRot) { [pscustomobject]@{
    raids = $conRot
    usos_hab = @($p.casts.GetEnumerator() | Sort-Object { -$_.Value.usos } | Select-Object -First 12 | ForEach-Object {
      [pscustomobject]@{ habilidad = $_.Key; usos = [math]::Round($_.Value.usos); usos_min = [math]::Round(60 * $_.Value.usos / [math]::Max(1, $p.vivo), 1)
        intervalo_s = [math]::Round($_.Value.int / [math]::Max(1, $_.Value.usos), 1) } })
    buffs = @($p.buffs.GetEnumerator() | ForEach-Object { [pscustomobject]@{ habilidad = $_.Key; activo_pct = [math]::Round(($_.Value | Measure-Object -Average).Average, 1); raids = $_.Value.Count } } |
      Sort-Object { -$_.activo_pct } | Select-Object -First 8)
  } } else { $null }
  $totalTries = ($raids | Measure-Object intentos -Sum).Sum
  $data = [pscustomobject]@{
    nombre = $name; slug = $slug; clase_id = $last.clase_id
    resumen = [pscustomobject]@{
      raids = $raids.Count; kills = @($raids | Where-Object matado).Count; intentos = $totalTries
      dps_medio = [math]::Round(($raids | Measure-Object dps -Average).Average)
      hps_medio = [math]::Round(($raids | Measure-Object hps -Average).Average)
      muertes = ($raids | Measure-Object muertes -Sum).Sum
      muertes_intento = [math]::Round(($raids | Measure-Object muertes -Sum).Sum / [math]::Max(1, $totalTries), 2)
      gs = $last.gs; cp = $last.cp; primera = $raids[0].fecha; ultima = $last.fecha
    }
    raids = $raids; habilidades = $skills; causas = $causes; apoyo = $apoyo; supervivencia = $superv; rotacion = $rotacion
    actualizado = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  }
  $dir = Join-Path $base $slug
  New-Item -ItemType Directory -Force $dir | Out-Null
  Write-Json (Join-Path $dir 'data.json') $data
  if (Test-Path $shell) { Copy-Item $shell (Join-Path $dir 'index.html') -Force }
  [pscustomobject]@{ slug = $slug; nombre = $name; clase_id = $last.clase_id; raids = $raids.Count; kills = $data.resumen.kills
    dps_medio = $data.resumen.dps_medio; hps_medio = $data.resumen.hps_medio; muertes_intento = $data.resumen.muertes_intento
    gs = $last.gs; ultima = $last.fecha; perfil = (Test-Path (Join-Path $dir 'perfil.json')) }
}
Write-Json (Join-Path $base 'index.json') @($index | Sort-Object { -$_.raids }, nombre)
Write-Host "Perfiles: $(@($index).Count) jugadores"

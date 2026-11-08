<#
  Compara dos JSON por contenido (no por formato): mismas claves, mismos valores, números con tolerancia.
  Sirve para comprobar que un cambio en los scripts no altera los datos de la web.
    powershell -ExecutionPolicy Bypass -File tools\comparar-json.ps1 viejo.json nuevo.json [-Ignorar meta.extraido] [-SinOrden dps_intento]
  -SinOrden: listas cuyo orden no importa (se ordenan por su contenido antes de comparar).
#>
param([Parameter(Mandatory)][string]$A, [Parameter(Mandatory)][string]$B, [string[]]$Ignorar = @(), [string[]]$SinOrden = @(), [int]$Max = 40)
$ErrorActionPreference = 'Stop'
$Ignorar = @($Ignorar | ForEach-Object { $_ -split ',' }); $SinOrden = @($SinOrden | ForEach-Object { $_ -split ',' })
$script:dif = New-Object System.Collections.ArrayList
function Leer($p) { [IO.File]::ReadAllText((Resolve-Path $p), [Text.Encoding]::UTF8) | ConvertFrom-Json }
function Clave($x) { ConvertTo-Json -InputObject $x -Depth 10 -Compress }
function Comparar($x, $y, [string]$ruta) {
  $rutaSinIndices = $ruta -replace '\[\d+\]', ''
  if ($Ignorar -contains $rutaSinIndices.TrimStart('.')) { return }
  if ($null -eq $x -or $null -eq $y) { if (-not ($null -eq $x -and $null -eq $y)) { [void]$script:dif.Add("$ruta : $(Clave $x) <> $(Clave $y)") }; return }
  if ($x -is [array] -or $y -is [array]) {
    $xa = @($x); $ya = @($y)
    if ($SinOrden -contains $rutaSinIndices.TrimStart('.')) { $xa = @($xa | Sort-Object { Clave $_ }); $ya = @($ya | Sort-Object { Clave $_ }) }
    if ($xa.Count -ne $ya.Count) { [void]$script:dif.Add("$ruta : $($xa.Count) elementos <> $($ya.Count)") }
    for ($i = 0; $i -lt [math]::Min($xa.Count, $ya.Count); $i++) { Comparar $xa[$i] $ya[$i] "$ruta[$i]" }
    return
  }
  if ($x -is [pscustomobject] -and $y -is [pscustomobject]) {
    $kx = @($x.PSObject.Properties.Name); $ky = @($y.PSObject.Properties.Name)
    foreach ($k in ($kx + $ky | Select-Object -Unique)) {
      if ($kx -notcontains $k -or $ky -notcontains $k) { if ($Ignorar -notcontains ("$ruta.$k" -replace '\[\d+\]', '').TrimStart('.')) { [void]$script:dif.Add("$ruta.$k : falta en $(if ($kx -notcontains $k) { 'A' } else { 'B' })") }; continue }
      Comparar $x.$k $y.$k "$ruta.$k"
    }
    return
  }
  $nx = $x -is [ValueType] -and -not ($x -is [bool]); $ny = $y -is [ValueType] -and -not ($y -is [bool])
  if ($nx -and $ny) { if ([math]::Abs([double]$x - [double]$y) -gt 1e-9) { [void]$script:dif.Add("$ruta : $x <> $y") }; return }
  if ("$x" -ne "$y" -or $x.GetType() -ne $y.GetType()) { [void]$script:dif.Add("$ruta : $(Clave $x) <> $(Clave $y)") }
}
Comparar (Leer $A) (Leer $B) ''
if ($script:dif.Count) { Write-Output "$($script:dif.Count) diferencias:"; $script:dif | Select-Object -First $Max } else { Write-Output 'Iguales.' }

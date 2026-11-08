# Funciones comunes para usar la base de datos db/aion.duckdb desde los scripts (se cargan con: . "$PSScriptRoot\duckdb.ps1")

function Find-DuckDb {
  $c = Get-Command duckdb -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $p = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter duckdb.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($p) { return $p.FullName }
  throw 'No encuentro duckdb.exe. Instálalo con: winget install DuckDB.cli'
}

# Ejecuta SQL (con comandos .read, .output…) y devuelve las líneas de salida sin cabecera.
# El SQL va por un archivo temporal: por la tubería, PowerShell 5.1 estropea los comandos que empiezan por punto.
function Invoke-Duck([string]$Db, [string]$Sql, [switch]$SoloLectura) {
  if (-not $script:duckExe) { $script:duckExe = Find-DuckDb }
  $tmp = Join-Path $env:TEMP ('dps-aion-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.sql')
  [IO.File]::WriteAllText($tmp, $Sql, (New-Object Text.UTF8Encoding $false))
  try {
    $args = New-Object System.Collections.ArrayList
    [void]$args.Add($Db); if ($SoloLectura) { [void]$args.Add('-readonly') }
    [void]$args.AddRange(@('-bail', '-noheader', '-list', '-f', $tmp))
    $out = & $script:duckExe $args.ToArray() 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw "DuckDB: $($out -join "`n")" }
    $out
  } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

# Texto seguro dentro de comillas simples de SQL; rutas con barras normales
function Sql-Texto([string]$s) { "'" + ($s -replace "'", "''") + "'" }
function Sql-Ruta([string]$p) { Sql-Texto ($p -replace '\', '/') }

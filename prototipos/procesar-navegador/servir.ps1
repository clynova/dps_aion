<#
  Servidor local SOLO para la prueba de concepto (fase 1). Sirve el repo en http://localhost:8766/ y, para poder
  probar sin el selector de carpetas, la carpeta de Questlog en /questlog/ (solo lectura) y su lista en /questlog-lista.
  POST /guardar?nombre=x guarda el cuerpo en -Salida (para comparar el JSON del navegador con el de DuckDB nativo).
  Uso: powershell -ExecutionPolicy Bypass -File prototipos\procesar-navegador\servir.ps1 -Salida <carpeta>
  Abrir: http://localhost:8766/prototipos/procesar-navegador/
#>
param([string]$Salida = (Join-Path $env:TEMP 'dps-aion-prueba'), [int]$Puerto = 8766)
$raiz = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$q = "$env:APPDATA\Questlog\aion-2"
New-Item -ItemType Directory -Force $Salida | Out-Null
$tipos = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.sql' = 'text/plain; charset=utf-8'; '.gz' = 'application/gzip' }
$l = New-Object Net.HttpListener; $l.Prefixes.Add("http://localhost:$Puerto/"); $l.Start()
Write-Host "Prueba en http://localhost:$Puerto/prototipos/procesar-navegador/  (salida: $Salida)"
function Enviar($c, [byte[]]$b, $tipo) { if ($tipo) { $c.Response.ContentType = $tipo }; $c.Response.OutputStream.Write($b, 0, $b.Length) }
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/')
    if ($c.Request.HttpMethod -eq 'POST' -and $p -eq 'guardar') {
      $nombre = [IO.Path]::GetFileName($c.Request.QueryString['nombre'])
      $ms = New-Object IO.MemoryStream; $c.Request.InputStream.CopyTo($ms)
      [IO.File]::WriteAllBytes((Join-Path $Salida $nombre), $ms.ToArray())
      Enviar $c ([Text.Encoding]::UTF8.GetBytes('ok')) 'text/plain'
    } elseif ($p -eq 'questlog-lista') {
      $lista = @(Get-ChildItem "$q\runs" -Filter '*.json' | ForEach-Object { "runs/$($_.Name)" }) + @(Get-ChildItem "$q\encounters" | ForEach-Object { "encounters/$($_.Name)" })
      Enviar $c ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $lista -Compress))) $tipos['.json']
    } else {
      $f = if ($p.StartsWith('questlog/')) { Join-Path $q ($p.Substring(9) -replace '/', '\') } else { Join-Path $raiz ($p -replace '/', '\') }
      $f = [IO.Path]::GetFullPath($f)
      if (-not ($f.StartsWith($raiz) -or $f.StartsWith($q))) { $c.Response.StatusCode = 403 }
      elseif (Test-Path $f -PathType Container) { $f = Join-Path $f 'index.html' }
      if ($c.Response.StatusCode -ne 403) {
        if (Test-Path $f -PathType Leaf) { Enviar $c ([IO.File]::ReadAllBytes($f)) $tipos[[IO.Path]::GetExtension($f)] } else { $c.Response.StatusCode = 404 }
      }
    }
  } catch { $c.Response.StatusCode = 500 }
  $c.Response.Close()
}

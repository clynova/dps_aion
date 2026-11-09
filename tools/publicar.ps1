<#
  Publica en la web desde el PC, con el token del grupo (se crea en la web: Ajustes del grupo → Tokens).

  Primera vez (guarda la web, el grupo y el token en %APPDATA%\dps-aion\config.json; el token va cifrado con tu usuario
  de Windows):
    powershell -ExecutionPolicy Bypass -File tools\publicar.ps1 -Configurar
    ... -Configurar -Api https://dpsaion.vercel.app -Grupo tetones -Token dps_...

  Raid (extrae con tools\extraer-raid.ps1 y la sube; si ya estaba, la actualiza):
    ... tools\publicar.ps1                      # la última raid
    ... -Run 656c [-Jefe 2301006] [-SinCargar]  # una run concreta (mismas opciones que extraer-raid.ps1)
    ... -Lista                                  # ver las últimas runs
    ... -Visibilidad privada|enlace|publica     # si no, la que tenga el grupo por defecto (al actualizar se conserva)
    ... -Reemplazar                             # si otra persona del grupo ya subió esa noche, la sustituye
    ... -Archivo C:\ruta\raid.json              # subir un JSON ya extraído

  Textos de Claude (el idioma sale del nombre: .en.json = inglés; el slug, de la carpeta, o con -Slug):
    ... -Analisis raids\<slug>\analisis.json, raids\<slug>\analisis.en.json
    ... -Perfil jugadores\<jugador>\perfil.json, jugadores\<jugador>\perfil.en.json

  Nombres de habilidades y NPC: la web no puede bajarlos de questlog.gg (Cloudflare bloquea a Vercel), así que tras
  cada subida este script pregunta qué ids de las raids del grupo no tienen nombre, los busca en questlog.gg desde el
  PC y los manda. A mano (por ejemplo, tras subir raids desde el navegador):
    ... -Nombres

  Preview protegida por Vercel: -Configurar -Bypass <secreto de «Protection Bypass for Automation»> (se guarda cifrado).
  También lee DPS_AION_API, DPS_AION_GRUPO, DPS_AION_TOKEN y DPS_AION_BYPASS (ganan a la configuración; los
  parámetros ganan a todo).
  Códigos de salida: 0 bien, 1 error, 2 la noche ya estaba subida por otra persona (usa -Reemplazar).
#>
param(
  [switch]$Configurar,
  [string]$Api,
  [string]$Grupo,
  [string]$Token,
  [string]$Bypass,
  [Alias('Run')][string]$RunId,
  [Alias('Jefe')][string]$JefeNpc,
  [switch]$SinCargar,
  [switch]$Lista,
  [string]$BaseDatos,
  [string]$Archivo,
  [ValidateSet('privada', 'enlace', 'publica')][string]$Visibilidad,
  [switch]$Reemplazar,
  [string[]]$Analisis,
  [string[]]$Perfil,
  [string]$Slug,
  [switch]$Nombres,
  [string]$Repo = (Split-Path $PSScriptRoot -Parent)
)
$ErrorActionPreference = 'Stop'
# Los errores se muestran como un mensaje claro, sin la traza de PowerShell, y salen con código 1 (el .bat lo ve)
trap { Write-Host ''; Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
$utf8 = New-Object Text.UTF8Encoding $false
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$cfgDir = Join-Path $env:APPDATA 'dps-aion'
$cfgPath = Join-Path $cfgDir 'config.json'
$patronToken = '^dps_[A-Za-z0-9_-]{20,}$'

# --- Configuración ----------------------------------------------------------------------------------------------
function Leer-Config {
  $c = [ordered]@{ api = 'https://dpsaion.vercel.app'; grupo = ''; token = ''; bypass = '' }
  if (Test-Path $cfgPath) {
    $f = [IO.File]::ReadAllText($cfgPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($f.api) { $c.api = $f.api }
    if ($f.grupo) { $c.grupo = $f.grupo }
    foreach ($k in 'token', 'bypass') {
      if (-not $f.$k) { continue }
      try {
        $s = ConvertTo-SecureString $f.$k
        $c[$k] = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
      } catch { Write-Warning "No se pudo leer el $k guardado (¿otro usuario de Windows?). Vuelve a ejecutar con -Configurar." }
    }
  }
  if ($env:DPS_AION_API) { $c.api = $env:DPS_AION_API }
  if ($env:DPS_AION_GRUPO) { $c.grupo = $env:DPS_AION_GRUPO }
  if ($env:DPS_AION_TOKEN) { $c.token = $env:DPS_AION_TOKEN }
  if ($env:DPS_AION_BYPASS) { $c.bypass = $env:DPS_AION_BYPASS }
  if ($Api) { $c.api = $Api }
  if ($Grupo) { $c.grupo = $Grupo }
  if ($Token) { $c.token = $Token }
  if ($Bypass) { $c.bypass = $Bypass }
  $c.api = $c.api.TrimEnd('/')
  $c.grupo = $c.grupo.Trim().ToLowerInvariant()  # las direcciones de grupo van en minúsculas
  $c
}

$cfg = Leer-Config
if ($Configurar) {
  if (-not $Api) { $r = Read-Host "Web [$($cfg.api)]"; if ($r) { $cfg.api = $r.TrimEnd('/') } }
  if (-not $Grupo) { $r = Read-Host "Grupo (lo que va después de /g/ en la dirección) [$($cfg.grupo)]"; if ($r) { $cfg.grupo = $r.Trim().ToLowerInvariant() } }
  if (-not $Token) { $r = Read-Host 'Token (dps_..., de Ajustes del grupo → Tokens)'; if ($r) { $cfg.token = $r.Trim() } }
  if ($cfg.token -notmatch $patronToken) { throw 'Ese token no tiene el formato dps_... Cópialo entero desde Ajustes del grupo.' }
  if ($cfg.grupo.ToLowerInvariant() -cnotmatch '^[a-z0-9-]{3,40}$') { throw 'El grupo es la dirección del grupo (minúsculas, números y guiones).' }
  if (-not $Bypass -and $cfg.api -match '\.vercel\.app$' -and $cfg.api -ne 'https://dpsaion.vercel.app') {
    $r = Read-Host 'Secreto «Protection Bypass for Automation» de Vercel (solo para una preview protegida; Enter para ninguno)'
    $cfg.bypass = $r.Trim()
  }
  $cifrar = { param($t) if ($t) { ConvertTo-SecureString $t -AsPlainText -Force | ConvertFrom-SecureString } else { '' } }
  New-Item -ItemType Directory -Force $cfgDir | Out-Null
  [IO.File]::WriteAllText($cfgPath, ([pscustomobject]@{ api = $cfg.api; grupo = $cfg.grupo; token = (& $cifrar $cfg.token); bypass = (& $cifrar $cfg.bypass) } | ConvertTo-Json), $utf8)
  Write-Host "Configuración guardada en $cfgPath (web $($cfg.api), grupo $($cfg.grupo)$(if ($cfg.bypass) { ', con bypass de Vercel' }))."
  return
}

if ($Lista) { & (Join-Path $PSScriptRoot 'extraer-raid.ps1') -Lista -Repo $Repo -SinCargar:$SinCargar -BaseDatos $BaseDatos; return }

if (-not $cfg.grupo -or -not $cfg.token) {
  throw "Falta configurar la web, el grupo o el token. Crea un token en la web (Ajustes del grupo → Tokens) y ejecuta:`n  powershell -ExecutionPolicy Bypass -File tools\publicar.ps1 -Configurar"
}
if ($cfg.token -notmatch $patronToken) { throw 'El token configurado no tiene el formato dps_... Vuelve a ejecutar con -Configurar.' }

# --- HTTP ---------------------------------------------------------------------------------------------------------
# HttpWebRequest en vez de Invoke-RestMethod: el cuerpo va como bytes UTF-8 y la respuesta se lee en UTF-8 aunque
# no declare charset, y los 4xx se leen como respuesta (con su JSON de error) en vez de como excepción.
function Invoke-Api([string]$Metodo, [string]$Ruta, [string]$Cuerpo) {
  $req = [Net.HttpWebRequest]::Create($cfg.api + $Ruta)
  $req.Method = $Metodo
  $req.Headers['Authorization'] = "Bearer $($cfg.token)"
  $req.UserAgent = 'dps-aion-publicar/1'
  $req.Accept = 'application/json'
  $req.Timeout = 180000
  $req.AllowAutoRedirect = $false  # una redirección aquí es el login de Vercel de una preview protegida
  if ($cfg.bypass) { $req.Headers['x-vercel-protection-bypass'] = $cfg.bypass }
  if ($Cuerpo) {  # [string] convierte $null en «»: sin cuerpo (GET)
    $bytes = $utf8.GetBytes($Cuerpo)
    $req.ContentType = 'application/json; charset=utf-8'
    $req.ContentLength = $bytes.Length
    $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
  }
  try { $resp = $req.GetResponse() }
  catch {
    $e = $_.Exception; while ($e -and -not ($e -is [Net.WebException])) { $e = $e.InnerException }
    if (-not $e -or -not $e.Response) { throw "No se pudo conectar con $($cfg.api): $($_.Exception.Message)" }
    $resp = $e.Response
  }
  $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
  $texto = $sr.ReadToEnd(); $sr.Close()
  $estado = [int]$resp.StatusCode; $resp.Close()
  $obj = $null; try { $obj = $texto | ConvertFrom-Json } catch { }
  [pscustomobject]@{ Estado = $estado; Datos = $obj; Texto = $texto }
}

# Explica una respuesta que no fue bien y termina con error
function Fallo($r, [string]$que) {
  $d = $r.Datos
  # Vercel responde a una preview protegida con una redirección o con un 401 en JSON con «protection» (nuestra API
  # nunca devuelve ese campo)
  if (($r.Estado -ge 300 -and $r.Estado -lt 400) -or ($d -and $d.protection)) {
    throw "$que : la web pide el login de Vercel (preview protegida). En Vercel → Settings → Deployment Protection, crea un secreto de «Protection Bypass for Automation» y guárdalo con -Configurar -Bypass <secreto>."
  }
  if (-not $d) { throw "$que : respuesta inesperada ($($r.Estado)). ¿Es la dirección de la web correcta? (si es una preview de Vercel protegida, el PC no puede entrar)" }
  switch ($r.Estado) {
    401 { throw "$que : el token no vale (revocado o de otro grupo). Crea otro en Ajustes del grupo y ejecuta -Configurar." }
    403 { throw "$que : el token no tiene permiso para esto." }
    404 { throw "$que : no existe ($($d.error))." }
    422 { throw ("$que : la web no aceptó los datos:`n  " + (@($d.problemas) -join "`n  ")) }
    default { throw "$que : error $($r.Estado) ($($d.error))." }
  }
}

$g = [uri]::EscapeDataString($cfg.grupo)

# --- Nombres de questlog.gg ---------------------------------------------------------------------------------------
function Get-Questlog([string]$proc, [string]$idioma) {
  $in = [uri]::EscapeDataString('{"language":"' + $idioma + '"}')
  $r = Invoke-WebRequest "https://questlog.gg/aion-2/api/trpc/$proc`?input=$in" -UseBasicParsing -TimeoutSec 90
  # La respuesta no declara charset: se decodifica como UTF-8 a mano para no romper las tildes
  ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json).result.data
}
function Publicar-Nombres {
  $r = Invoke-Api 'GET' "/api/v1/grupos/$g/nombres" $null
  if ($r.Estado -ne 200) { Fallo $r 'Ver qué nombres faltan' }
  $hs = @($r.Datos.habilidades); $ns = @($r.Datos.npcs)
  if (-not $hs.Count -and -not $ns.Count) { Write-Host '  ✓ nombres: no falta ninguno'; return }
  Write-Host "  Buscando en questlog.gg $($hs.Count) habilidades y $($ns.Count) NPC sin nombre..."
  $ProgressPreference = 'SilentlyContinue'
  $cuerpo = [ordered]@{}
  foreach ($idioma in 'es', 'en') {
    $hQ = Get-Questlog 'combatLog.entities.skills' $idioma
    $nQ = (Get-Questlog 'combatLog.entities.names' $idioma).npc
    $hab = [ordered]@{}; $npc = [ordered]@{}
    foreach ($id in $hs) { $x = $hQ."$id"; if ($x -and $x.name) { $hab["$id"] = [ordered]@{ name = [string]$x.name; icon = [string]$x.icon } } }
    foreach ($id in $ns) { $x = $nQ."$id"; if ($x -and $x.name) { $npc["$id"] = [string]$x.name } }
    $cuerpo[$idioma] = [ordered]@{ habilidades = $hab; npcs = $npc }
  }
  $r = Invoke-Api 'POST' "/api/v1/grupos/$g/nombres" ($cuerpo | ConvertTo-Json -Depth 5 -Compress)
  if ($r.Estado -ne 200) { Fallo $r 'Mandar los nombres' }
  $sin = [math]::Max([int]$r.Datos.es.sinNombre, [int]$r.Datos.en.sinNombre)
  Write-Host "  ✓ nombres: $($r.Datos.es.guardados) en español y $($r.Datos.en.guardados) en inglés$(if ($sin) { " ($sin que questlog.gg no conoce)" })"
}
if ($Nombres) { Publicar-Nombres; return }

# --- Textos de Claude ---------------------------------------------------------------------------------------------
function Publicar-Texto([string]$tipo, [string]$ruta) {
  $p = (Resolve-Path $ruta).Path
  $idioma = if ($p -match '\.en\.json$') { 'en' } else { 'es' }
  $s = if ($Slug) { $Slug } else { Split-Path (Split-Path $p -Parent) -Leaf }
  $texto = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
  $null = $texto | ConvertFrom-Json  # falla aquí si el JSON está mal escrito
  $destino = if ($tipo -eq 'analisis') { "/api/v1/grupos/$g/raids/$([uri]::EscapeDataString($s))/analisis/$idioma" } else { "/api/v1/grupos/$g/jugadores/$([uri]::EscapeDataString($s))/perfil/$idioma" }
  $r = Invoke-Api 'PUT' $destino $texto
  if ($r.Estado -ne 200) { Fallo $r "$tipo de $s ($idioma)" }
  Write-Host "  ✓ $tipo de $s ($idioma)"
}
if ($Analisis -or $Perfil) {
  # con -File (el .bat), «a,b» llega como un solo texto: se separa aquí
  foreach ($a in @($Analisis | ForEach-Object { $_ -split ',' } | Where-Object { $_.Trim() })) { Publicar-Texto 'analisis' $a.Trim() }
  foreach ($a in @($Perfil | ForEach-Object { $_ -split ',' } | Where-Object { $_.Trim() })) { Publicar-Texto 'perfil' $a.Trim() }
  return
}

# --- Raid ---------------------------------------------------------------------------------------------------------
# Huella del SQL que calcula las cifras, igual que scripts/generar-sql.mjs (sql_version de las subidas del navegador)
function Sql-Version {
  $partes = foreach ($f in 'cargar.sql', 'vistas.sql', 'raid.sql') { [IO.File]::ReadAllText((Join-Path $Repo "db\$f"), $utf8) -replace "`r`n", "`n" }
  $h = [Security.Cryptography.SHA256]::Create().ComputeHash($utf8.GetBytes(($partes -join "`n--`n")))
  (-join ($h | ForEach-Object { $_.ToString('x2') })).Substring(0, 12)
}

$extraidoAhora = -not $Archivo
if (-not $Archivo) {
  $extra = @{ Repo = $Repo; Api = $cfg.api }
  if ($cfg.bypass) { $extra.Bypass = $cfg.bypass }
  if ($RunId) { $extra.RunId = $RunId }
  if ($JefeNpc) { $extra.JefeNpc = $JefeNpc }
  if ($SinCargar) { $extra.SinCargar = $true }
  if ($BaseDatos) { $extra.BaseDatos = $BaseDatos }
  $Archivo = & (Join-Path $PSScriptRoot 'extraer-raid.ps1') @extra | Select-Object -Last 1
}
$texto = [IO.File]::ReadAllText((Resolve-Path $Archivo).Path, [Text.Encoding]::UTF8).Trim()
if (-not $texto.StartsWith('{')) { throw "$Archivo no es un JSON de raid." }
# Versión del formato y del SQL, delante del resto (sin volver a serializar: ConvertTo-Json de PowerShell 5.1 cambia
# números y listas vacías). Solo si se acaba de extraer: un data.json antiguo (-Archivo) va tal cual, como v1.
if ($extraidoAhora -and $texto -notmatch '^\{\s*"esquema_version"') { $texto = '{"esquema_version":2,"sql_version":"' + (Sql-Version) + '",' + $texto.Substring(1) }

$consulta = @()
if ($Visibilidad) { $consulta += "visibilidad=$Visibilidad" }
if ($Reemplazar) { $consulta += 'reemplazar=1' }
$q = if ($consulta) { '?' + ($consulta -join '&') } else { '' }

Write-Host "Subiendo a $($cfg.api) (grupo $($cfg.grupo))..."
$r = Invoke-Api 'POST' "/api/v1/grupos/$g/raids$q" $texto
if ($r.Estado -eq 409 -and $r.Datos.error -eq 'duplicada') {
  Write-Host ''
  Write-Host "Esa noche ya está subida en el grupo como «$($r.Datos.existente)» (quizá la grabó otra persona)."
  Write-Host 'Para sustituirla por esta, repite con -Reemplazar.'
  exit 2
}
if ($r.Estado -ne 200 -and $r.Estado -ne 201) { Fallo $r 'Subir la raid' }
Write-Host ''
Write-Host ("{0}: {1}{2}" -f $(if ($r.Datos.nueva) { 'Raid publicada' } else { 'Raid actualizada' }), $cfg.api, $r.Datos.url)
# Los nombres no impiden la subida: si fallan, se avisa y se pueden mandar luego con -Nombres
try { Publicar-Nombres } catch { Write-Warning "No se pudieron mandar los nombres ($($_.Exception.Message)). Repite con -Nombres." }

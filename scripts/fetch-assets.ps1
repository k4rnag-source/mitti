$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $root "Mitti/Assets/3D"
$web = Join-Path $root "Mitti/web"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
New-Item -ItemType Directory -Force -Path $web | Out-Null

function Find-Url($node, [string]$wantedTitle) {
  if ($null -eq $node) { return $null }
  if ($node -is [System.Collections.IEnumerable] -and $node -isnot [string]) {
    foreach ($child in $node) { $hit = Find-Url $child $wantedTitle; if ($hit) { return $hit } }
    return $null
  }
  $title = $null
  foreach ($p in $node.PSObject.Properties) {
    if ($p.Name -in @("title","name","label")) { $title = [string]$p.Value; break }
  }
  if ($title -eq $wantedTitle) {
    foreach ($p in $node.PSObject.Properties) {
      if ($p.Name -in @("cdnUrl","cdn_url","model_url","downloadUrl","download_url","url")) {
        $v = [string]$p.Value
        if ($v -match '^https?://') { return $v }
      }
    }
  }
  foreach ($p in $node.PSObject.Properties) {
    if ($p.Value -and $p.Value -isnot [string]) { $hit = Find-Url $p.Value $wantedTitle; if ($hit) { return $hit } }
  }
  return $null
}

$wanted = @(
  @{Title="Retriever Standing"; File="standing.glb"},
  @{Title="Retriever Sitting"; File="sitting.glb"},
  @{Title="Retriever Lying"; File="lying.glb"}
)

foreach($item in $wanted) {
  $q = [uri]::EscapeDataString($item.Title)
  $result = Invoke-RestMethod -Uri "https://3dassets.dev/api/v1/assets?q=$q&limit=20"
  $url = Find-Url $result $item.Title
  if (-not $url) {
    $fallback = Find-Url $result "Retriever"
    if ($fallback) { $url = $fallback }
  }
  if (-not $url) { throw "Could not resolve 3D asset URL for $($item.Title)" }
  Write-Host "Downloading $($item.Title) from $url"
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $assetDir $item.File)
}

Invoke-WebRequest "https://unpkg.com/three@0.180.0/build/three.module.min.js" -OutFile (Join-Path $web "three.module.min.js")
Invoke-WebRequest "https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js" -OutFile (Join-Path $web "GLTFLoader.js")

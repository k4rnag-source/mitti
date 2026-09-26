$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $root "Mitti/Assets/3D"
$web = Join-Path $root "Mitti/web"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
New-Item -ItemType Directory -Force -Path $web | Out-Null
$manifest = Invoke-RestMethod -Uri "https://3dassets.dev/api/v1/packs/companion-animals-and-pet-home"

function Find-Asset($node, [string]$wantedTitle) {
  if ($null -eq $node) { return $null }
  if ($node -is [System.Collections.IEnumerable] -and $node -isnot [string]) {
    foreach ($child in $node) { $hit = Find-Asset $child $wantedTitle; if ($hit) { return $hit } }
    return $null
  }
  $title = $null
  foreach ($p in $node.PSObject.Properties) {
    if ($p.Name -in @("title","name","label")) { $title = [string]$p.Value; break }
  }
  if ($title -eq $wantedTitle) { return $node }
  foreach ($p in $node.PSObject.Properties) {
    if ($p.Value -and $p.Value -isnot [string]) { $hit = Find-Asset $p.Value $wantedTitle; if ($hit) { return $hit } }
  }
  return $null
}
function Get-AssetUrl($asset, [string]$title) {
  foreach ($p in $asset.PSObject.Properties) {
    if ($p.Name -in @("model_url","cdn_url","download_url","url")) {
      $v = [string]$p.Value
      if ($v -match '^https?://') { return $v }
    }
  }
  throw "No CDN/download URL found for $title"
}
$wanted = @(
  @{Title="Retriever Standing"; File="standing.glb"},
  @{Title="Retriever Sitting"; File="sitting.glb"},
  @{Title="Retriever Lying"; File="lying.glb"}
)
foreach($item in $wanted) {
  $asset = Find-Asset $manifest $item.Title
  if (-not $asset) { throw "Asset not found in 3DAssets manifest: $($item.Title)" }
  $url = Get-AssetUrl $asset $item.Title
  Write-Host "Downloading $($item.Title) from $url"
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $assetDir $item.File)
}
Invoke-WebRequest "https://unpkg.com/three@0.180.0/build/three.module.min.js" -OutFile (Join-Path $web "three.module.min.js")
Invoke-WebRequest "https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js" -OutFile (Join-Path $web "GLTFLoader.js")

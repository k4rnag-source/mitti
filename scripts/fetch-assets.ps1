$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $root "Mitti/Assets/3D"
$web = Join-Path $root "Mitti/web"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
New-Item -ItemType Directory -Force -Path $web | Out-Null

$manifestUrl = "https://3dassets.dev/api/v1/packs/companion-animals-and-pet-home"
$manifest = Invoke-RestMethod -Uri $manifestUrl

$wanted = @(
 @{Title="Retriever Standing"; File="standing.glb"},
 @{Title="Retriever Sitting"; File="sitting.glb"},
 @{Title="Retriever Lying"; File="lying.glb"}
)

foreach($item in $wanted){
  $m = $manifest.models | Where-Object { $_.title -eq $item.Title } | Select-Object -First 1
  if(-not $m){ throw "Asset not found: $($item.Title)" }
  $url = $m.model_url
  if(-not $url){ $url = $m.url }
  if(-not $url){ throw "No download URL for $($item.Title)" }
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $assetDir $item.File)
}

Invoke-WebRequest "https://unpkg.com/three@0.180.0/build/three.module.min.js" -OutFile (Join-Path $web "three.module.min.js")
Invoke-WebRequest "https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js" -OutFile (Join-Path $web "GLTFLoader.js")

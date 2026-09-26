$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $root "Mitti/Assets/3D"
$web = Join-Path $root "Mitti/web"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
New-Item -ItemType Directory -Force -Path $web | Out-Null

function Get-Text($obj, $names) {
  foreach($name in $names) {
    $p = $obj.PSObject.Properties[$name]
    if ($p -and $p.Value) { return [string]$p.Value }
  }
  return ""
}

$wanted = @(
  @{Title="Retriever Standing"; File="standing.glb"},
  @{Title="Retriever Sitting"; File="sitting.glb"},
  @{Title="Retriever Lying"; File="lying.glb"}
)

foreach($item in $wanted) {
  $q = [uri]::EscapeDataString($item.Title)
  $result = Invoke-RestMethod -Uri "https://3dassets.dev/api/v1/assets?q=$q&limit=100"
  $asset = $null
  foreach($collectionName in @("assets","data","results")) {
    $collection = $result.PSObject.Properties[$collectionName]
    if ($collection -and $collection.Value) {
      foreach($a in @($collection.Value)) {
        $t = Get-Text $a @("title","name")
        if ($t -like ($item.Title + "*")) { $asset = $a; break }
      }
    }
    if ($asset) { break }
  }
  if (-not $asset) {
    $sample = ($result | ConvertTo-Json -Depth 12 -Compress)
    Write-Host "3DAssets response sample: $($sample.Substring(0,[Math]::Min(4000,$sample.Length)))"
    throw "Could not resolve 3D asset '$($item.Title)'"
  }
  $url = Get-Text $asset @("cdnUrl","cdn_url","downloadUrl","download_url","url")
  if (-not $url) { throw "Asset '$($item.Title)' has no CDN URL" }
  Write-Host "Downloading $($item.Title) from $url"
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $assetDir $item.File)
}

Invoke-WebRequest "https://unpkg.com/three@0.180.0/build/three.module.min.js" -OutFile (Join-Path $web "three.module.min.js")
Invoke-WebRequest "https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js" -OutFile (Join-Path $web "GLTFLoader.js")

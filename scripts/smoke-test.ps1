$ErrorActionPreference = "Stop"

$ready = Join-Path $env:LOCALAPPDATA "Mitti\renderer-ready.txt"
if (Test-Path $ready) { Remove-Item $ready -Force }

$app = Join-Path $PSScriptRoot "..\electron\dist\win-unpacked\Mitti.exe"
if (-not (Test-Path $app)) { throw "Packaged app not found: $app" }

$p = Start-Process -FilePath $app -ArgumentList "--smoke" -PassThru -WindowStyle Normal
try {
  $deadline = (Get-Date).AddSeconds(40)
  $ok = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $ready) {
      $kind = (Get-Content $ready -ErrorAction SilentlyContinue | Select-Object -First 1)
      Write-Host "Renderer reported: $kind"
      if ($kind -eq "3d") { $ok = $true; break }
    }
    if ($p.HasExited) {
      throw "Mitti exited early with code $($p.ExitCode)"
    }
  }
  if (-not $ok) { throw "3D renderer did not become ready within 40 seconds." }

  $proc = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if (-not $proc) { throw "Mitti process disappeared after renderer startup." }

  Write-Host "Mitti smoke test passed."
}
finally {
  if ($p -and -not $p.HasExited) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
}

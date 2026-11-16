param([switch]$Quiet)
# Controlled update detection. No unsigned package is installed automatically.
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $MyInvocation.MyCommand.Path
try {
  $cfg=Get-Content -LiteralPath (Join-Path $Root 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $location=[string]$cfg.update_share
  if ([string]::IsNullOrWhiteSpace($location)) { exit 0 }
  $manifest=Join-Path $location 'release.json'
  if (!(Test-Path -LiteralPath $manifest -PathType Leaf)) { exit 0 }
  $remote=Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
  $version=[string]$remote.version
  if ($version -match '^\d+\.\d+\.\d+$' -and $version -ne [string]$cfg.app_version) {
    $msg="Talep Kontrol yayin kanalinda farkli bir surum var: $version. Guvenli imzali guncelleyici BT kabulunden sonra etkinlestirilecek."
    if (!$Quiet) { Write-Host $msg -ForegroundColor Yellow }
    $dest=Join-Path $env:LOCALAPPDATA 'TalepKontrol\update-available.txt'
    New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
    Set-Content -LiteralPath $dest -Value $msg -Encoding UTF8
  }
} catch { if (!$Quiet) { Write-Warning $_.Exception.Message } }
exit 0

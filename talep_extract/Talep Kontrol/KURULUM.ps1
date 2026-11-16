$ErrorActionPreference='Stop'
$Source=Split-Path -Parent $MyInvocation.MyCommand.Path
$Target=Join-Path $env:LOCALAPPDATA 'Programs\TalepKontrol'
if (!(Test-Path (Join-Path $Source 'server.py'))) { throw 'Uygulama paket dosyalari eksik.' }
if (Test-Path $Target) {
  Write-Host '[DURDURULDU] Kurulum zaten mevcut; eski surumu ve kayitlari silmeden once dagitim talimatini izleyin.' -ForegroundColor Yellow
  Write-Host $Target
  exit 8
}
Write-Host 'Talep Kontrol 3.13.0 - yeni kullanici kurulumu' -ForegroundColor Cyan
$parent=Split-Path $Target -Parent
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$stage=Join-Path $parent ('TalepKontrol-YUKLE-'+[guid]::NewGuid().ToString('N').Substring(0,10))
try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force }
  if (!(Test-Path (Join-Path $stage 'config.json'))) { throw 'Kurulum oncesi paket kontrolu basarisiz.' }
  Move-Item -LiteralPath $stage -Destination $Target
  $link=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Talep Kontrol.lnk'
  $wsh=New-Object -ComObject WScript.Shell
  $shortcut=$wsh.CreateShortcut($link)
  $shortcut.TargetPath=Join-Path $Target 'BASLAT.vbs'
  $shortcut.WorkingDirectory=$Target
  $shortcut.IconLocation=(Join-Path $Target 'assets\brand\talep-kontrol.ico')+',0'
  $shortcut.Description='Talep Kontrol 3.13.0'
  $shortcut.Save()
  Write-Host 'Kurulum basarili. Masaustundeki Talep Kontrol kisayolunu kullanin.' -ForegroundColor Green
  Write-Host 'Kurulum:' $Target
  Write-Host 'Not: Merkezi ag erisimi ve Python runtime testi sirket ortaminda yapilmalidir.'
} finally {
  if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}

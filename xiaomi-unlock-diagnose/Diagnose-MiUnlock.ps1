#Requires -Version 5.1
<#
.SYNOPSIS
  Xiaomi Mi Max 2 (oxygen) — güvenli, salt okunur bootloader / Mi Unlock teşhis ajanı.

.DESCRIPTION
  Yalnızca okuma komutları çalıştırır. Flash, erase, unlock, EDL, set_active YAPMAZ.
  Mi Unlock uygulamasını yalnızca -LaunchMiUnlock ile ve açık onay sonrası başlatır.

.PARAMETER MiUnlockErrorMessage
  Mi Unlock hata mesajı / kodu (sınıflandırma için).

.PARAMETER LaunchMiUnlock
  Resmî Mi Unlock'u başlatmak için açık onay bayrağı.

.PARAMETER AssumeBootable
  Telefon normal açılabiliyorsa kullanıcı kontrol listesini rapora ekler.

.PARAMETER FastbootPath
  fastboot.exe tam yolu (opsiyonel).
#>
[CmdletBinding()]
param(
    [string]$MiUnlockErrorMessage = "",
    [switch]$LaunchMiUnlock,
    [switch]$AssumeBootable,
    [string]$FastbootPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot
$LogDir = Join-Path $ScriptRoot "logs"
$ReportDir = Join-Path $ScriptRoot "reports"
$DataDir = Join-Path $ScriptRoot "data"
New-Item -ItemType Directory -Force -Path $LogDir, $ReportDir | Out-Null
. (Join-Path $ScriptRoot "_Classify.ps1")

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "diagnose-$Stamp.log"
$ReportFile = Join-Path $ReportDir "report-$Stamp.md"

# --- Yasaklı komut kalıpları (asla çalıştırılmaz) ---
$ForbiddenPatterns = @(
    'erase', 'format', 'flash', 'flashall', 'update',
    'oem unlock', 'flashing unlock', 'unlock_critical',
    'reboot-edl', 'set_active', 'oem edl', 'boot '
)

# Yalnızca bu tam argüman dizileri izinli
$AllowedArgSets = @(
    @('--version'),
    @('devices'),
    @('getvar', 'product'),
    @('getvar', 'unlocked'),
    @('getvar', 'secure'),
    @('getvar', 'anti'),
    @('getvar', 'current-slot'),
    @('oem', 'device-info')
)

function Write-Log {
    param([string]$Message, [ValidateSet('INFO','WARN','ERROR','CMD','OUT')][string]$Level = 'INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    switch ($Level) {
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        'CMD'   { Write-Host $line -ForegroundColor Cyan }
        'OUT'   { Write-Host $line -ForegroundColor Gray }
        default { Write-Host $line }
    }
}

function Mask-Identifier {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "(yok)" }
    $t = $Value.Trim()
    if ($t.Length -le 4) { return "****" }
    return ("*" * ([Math]::Max(0, $t.Length - 4))) + $t.Substring($t.Length - 4)
}

function Assert-AllowedFastbootArgs {
    param([string[]]$Args)
    $joined = ($Args -join ' ').ToLowerInvariant()
    foreach ($p in $ForbiddenPatterns) {
        if ($joined.Contains($p.ToLowerInvariant())) {
            throw "GÜVENLİK: Yasaklı fastboot argümanı engellendi: $joined"
        }
    }
    $ok = $false
    foreach ($set in $script:AllowedArgSets) {
        if ($Args.Count -ne $set.Count) { continue }
        $match = $true
        for ($i = 0; $i -lt $set.Count; $i++) {
            if ($Args[$i].ToLowerInvariant() -ne $set[$i].ToLowerInvariant()) {
                $match = $false
                break
            }
        }
        if ($match) { $ok = $true; break }
    }
    if (-not $ok) {
        throw "GÜVENLİK: İzin verilmeyen fastboot komutu: $joined"
    }
}

function Invoke-SafeFastboot {
    param([string[]]$FbArgs)
    Assert-AllowedFastbootArgs -Args $FbArgs
    Write-Log ("fastboot " + ($FbArgs -join ' ')) -Level CMD
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $script:FastbootExe
    $psi.Arguments = ($FbArgs | ForEach-Object {
        if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
    }) -join ' '
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    [void]$p.Start()
    $stdout = $p.StandardOutput.ReadToEnd()
    $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit(30000) | Out-Null
    $combined = (($stdout + "`n" + $stderr).Trim())
    # Mask potential serial/IMEI-like tokens in logs (keep last 4)
    $masked = [regex]::Replace($combined, '(?i)\b([A-Z0-9]{8,})\b', {
        param($m)
        Mask-Identifier $m.Groups[1].Value
    })
    if ($combined) { Write-Log $masked -Level OUT }
    else { Write-Log "(boş çıktı)" -Level OUT }
    return [pscustomobject]@{
        ExitCode = $p.ExitCode
        Raw      = $combined
        Masked   = $masked
        Unsupported = ($combined -match '(?i)FAILED|unknown command|not support|not allowed|GetVar Variable Not found')
    }
}

function Find-Fastboot {
    if ($FastbootPath -and (Test-Path $FastbootPath)) { return (Resolve-Path $FastbootPath).Path }
    $cmd = Get-Command fastboot -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\fastboot.exe",
        "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\fastboot.exe",
        "C:\platform-tools\fastboot.exe",
        "C:\Android\platform-tools\fastboot.exe",
        (Join-Path $RepoRoot "platform-tools\fastboot.exe")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

function Test-XiaomiUsbDriverHints {
    Write-Log "Xiaomi / Android USB sürücü ipuçları kontrol ediliyor (salt okunur)..."
    $hints = @()
    try {
        $drivers = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue |
            Where-Object {
                $_.DeviceName -match '(?i)Xiaomi|Android|ADB|Fastboot|WinUSB|Android Bootloader' -or
                $_.Manufacturer -match '(?i)Xiaomi|Google|Android'
            } |
            Select-Object -First 20 DeviceName, Manufacturer, DriverVersion
        if ($drivers) {
            foreach ($d in $drivers) {
                $hints += ("{0} | {1} | {2}" -f $d.DeviceName, $d.Manufacturer, $d.DriverVersion)
                Write-Log ("Sürücü: {0} | {1} | {2}" -f $d.DeviceName, $d.Manufacturer, $d.DriverVersion)
            }
        } else {
            Write-Log "Bilinen Xiaomi/Android sürücü kaydı bulunamadı (kesin yok anlamına gelmez)." -Level WARN
            $hints += "Kayit bulunamadi"
        }
    } catch {
        Write-Log ("Sürücü sorgusu başarısız: {0}" -f $_.Exception.Message) -Level WARN
        $hints += "Sorgu basarisiz"
    }
    return $hints
}

function Compare-ProductToMiMax2 {
    param([string]$Product)
    $modelsPath = Join-Path $DataDir "mi-max2-models.json"
    if (-not (Test-Path $modelsPath)) {
        return [pscustomobject]@{ Match = "bilinmiyor"; Detail = "model veritabani yok" }
    }
    $db = Get-Content $modelsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $p = ($Product -replace '(?i)^product:\s*', '').Trim()
    if ([string]::IsNullOrWhiteSpace($p) -or $p -match '(?i)FAILED|not found|error') {
        return [pscustomobject]@{ Match = "okunamadi"; Detail = "product değeri güvenilir şekilde okunamadı; tahmin yok" }
    }
    $known = @($db.known_product_codes) + @($db.codenames)
    foreach ($k in $known) {
        if ($p -eq $k) {
            return [pscustomobject]@{ Match = "eslesme"; Detail = "product='$p' Mi Max 2 (oxygen) ile uyumlu" }
        }
    }
    return [pscustomobject]@{
        Match = "eslesmiyor_veya_belirsiz"
        Detail = "product='$p' bilinen Mi Max 2 kodlarıyla birebir eşleşmedi. Tahmin yürütülmedi."
    }
}

function Get-BootableChecklist {
    @"
## Telefon normal açılabiliyorsa — sırayla kontrol edin

1. Mi hesabının cihazdaki hesapla aynı olduğunu doğrulayın.
2. SIM kartın takılı olduğunu doğrulayın.
3. Wi-Fi'yi kapatıp mobil veriyi kullanın.
4. Geliştirici seçeneklerinde OEM kilit açma ve USB hata ayıklamayı açın.
5. Mi Kilit Açma Durumu bölümünden hesap ve cihazı eşleştirin.
6. Mi hesabının ülke/bölge bilgisini kontrol edin.

Bu kontroller veri silmez; yalnızca ayar ve hesap durumunu doğrular.
"@
}

# ===================== ANA AKIŞ =====================
Write-Log "=== Xiaomi Mi Max 2 güvenli teşhis başladı ==="
Write-Log "Mod: salt okunur. Flash/erase/unlock/EDL yasak."
Write-Log ("Ortam: {0} | PS: {1}" -f $env:COMPUTERNAME, $PSVersionTable.PSVersion)

$results = [ordered]@{
    PlatformTools = "bulunamadi"
    XiaomiDrivers = @()
    DeviceDetected = "hayir"
    Product = "okunamadi"
    ProductMatch = "okunamadi"
    Unlocked = "okunamadi"
    Secure = "okunamadi"
    Anti = "okunamadi"
    CurrentSlot = "okunamadi"
    OemDeviceInfo = "okunamadi"
    RomRegion = "cihazdan güvenilir şekilde okunamadı (fastboot'ta genelde yok)"
    ErrorCategory = $null
    LikelyBlocker = "belirsiz"
    Evidence = @()
    Unsupported = @()
}

# 1) Platform Tools
$script:FastbootExe = Find-Fastboot
if ($script:FastbootExe) {
    $results.PlatformTools = "kurulu: $($script:FastbootExe)"
    Write-Log "Android Platform Tools (fastboot) bulundu: $($script:FastbootExe)"
} else {
    Write-Log "fastboot bulunamadı. Android Platform Tools kurulu değil veya PATH'te değil." -Level ERROR
    $results.LikelyBlocker = "USB sürücüsü sorunu / Platform Tools eksik (ön kontrol)"
}

# 2) Driver hints
$results.XiaomiDrivers = @(Test-XiaomiUsbDriverHints)

# 3) Error classification (user-provided)
$cls = Invoke-MiUnlockErrorClassify -Msg $MiUnlockErrorMessage
$results.ErrorCategory = $cls
Write-Log ("Mi Unlock hata sınıfı: {0} | {1}" -f $cls.Category, $cls.Reason)

if (-not $script:FastbootExe) {
    Write-Log "fastboot yok; cihaz komutları atlandı." -Level WARN
} else {
    $ver = Invoke-SafeFastboot @('--version')
    $results.Evidence += "fastboot --version => $($ver.Masked)"
    if ($ver.Unsupported) { $results.Unsupported += "fastboot --version: desteklenmeyen/hata" }

    $devs = Invoke-SafeFastboot @('devices')
    $results.Evidence += "fastboot devices => $($devs.Masked)"
    if ($devs.Raw -match '(?i)fastboot') {
        $results.DeviceDetected = "evet"
        Write-Log "Cihaz fastboot modunda algılandı."
    } else {
        $results.DeviceDetected = "hayir"
        Write-Log "fastboot devices boş — cihaz görünmüyor (kablo/sürücü/mod)." -Level WARN
        if ($results.LikelyBlocker -eq "belirsiz") {
            $results.LikelyBlocker = "USB sürücüsü sorunu"
        }
    }

    if ($results.DeviceDetected -eq "evet") {
        $getvars = @(
            @{ Key = 'Product'; Args = @('getvar','product'); Prop = 'Product' },
            @{ Key = 'Unlocked'; Args = @('getvar','unlocked'); Prop = 'Unlocked' },
            @{ Key = 'Secure'; Args = @('getvar','secure'); Prop = 'Secure' },
            @{ Key = 'Anti'; Args = @('getvar','anti'); Prop = 'Anti' },
            @{ Key = 'CurrentSlot'; Args = @('getvar','current-slot'); Prop = 'CurrentSlot' }
        )
        foreach ($g in $getvars) {
            $r = Invoke-SafeFastboot -FbArgs $g.Args
            $results.Evidence += ("fastboot {0} => {1}" -f ($g.Args -join ' '), $r.Masked)
            if ($r.Unsupported) {
                $results.Unsupported += ("{0}: desteklenmiyor veya hata" -f ($g.Args -join ' '))
                Write-Log ("Desteklenmeyen/hatalı komut (devam): {0}" -f ($g.Args -join ' ')) -Level WARN
            }
            # parse value
            $val = $null
            if ($r.Raw -match "(?im)^$($g.Args[1])\s*:\s*(.+)$") { $val = $Matches[1].Trim() }
            elseif ($r.Raw -match "(?im)$($g.Args[1])\s*:\s*(.+)$") { $val = $Matches[1].Trim() }
            if ($val) { $results[$g.Prop] = $val }
            else { $results[$g.Prop] = if ($r.Unsupported) { "desteklenmiyor/hata" } else { "okunamadi" } }
        }

        $oem = Invoke-SafeFastboot @('oem','device-info')
        $results.Evidence += "fastboot oem device-info => $($oem.Masked)"
        if ($oem.Unsupported) {
            $results.Unsupported += "oem device-info: desteklenmiyor veya hata"
            $results.OemDeviceInfo = "desteklenmiyor/hata"
            Write-Log "oem device-info desteklenmiyor; devam." -Level WARN
        } else {
            $results.OemDeviceInfo = $oem.Masked
        }

        $pm = Compare-ProductToMiMax2 -Product $results.Product
        $results.ProductMatch = "{0}: {1}" -f $pm.Match, $pm.Detail
        Write-Log $results.ProductMatch

        # ROM region: only if reliably readable — typically NOT available in fastboot
        Write-Log "ROM bölgesi (CN/Global): fastboot üzerinden güvenilir alan yok; raporlanmıyor." -Level INFO
        $results.RomRegion = "cihazdan güvenilir şekilde okunamadı"

        # Infer likely blocker from device state (no bypass advice)
        if ($results.Unlocked -match '(?i)^yes$') {
            $results.LikelyBlocker = "Bootloader zaten açık görünüyor; Mi Unlock tamamlanmış olabilir"
        } elseif ($cls.Category -ne "Belirtilmedi" -and $cls.Category -notmatch 'Sınıflandırılamadı') {
            $results.LikelyBlocker = $cls.Category
        } elseif ($results.Unlocked -match '(?i)^no$') {
            $results.LikelyBlocker = "Bootloader kilitli — resmi Mi Unlock sunucu yetkilendirmesi / hesap eşleştirme kontrolü gerekli"
        }
    }
}

# Official next step (data-safe)
$nextStep = @"
Veri kaybettirmeyen resmî sonraki adım:
1) Platform Tools ve Xiaomi USB sürücüsünün kurulu olduğundan emin olun.
2) Telefon açılabiliyorsa geliştirici seçeneklerinden OEM unlock + USB debugging açın; Mi Unlock Status ile hesabı eşleştirin; SIM + mobil veri kullanın.
3) Resmî Mi Unlock aracını Xiaomi sitesinden indirin; aynı Mi hesabıyla giriş yapın.
4) Bekleme süresi varsa süreyi doldurun (cihazı fabrika ayarına almadan).
5) Bu ajan Mi Unlock'u yalnızca açık onayınızla başlatır (-LaunchMiUnlock).
"@

if ($LaunchMiUnlock) {
    Write-Log "Kullanıcı açık onay verdi: Mi Unlock başlatma denenecek." -Level WARN
    $candidates = @(
        "$env:USERPROFILE\Desktop\miflash_unlock.exe",
        "$env:USERPROFILE\Downloads\miflash_unlock.exe",
        "C:\Program Files\Xiaomi\Mi Phone\miflash_unlock.exe",
        "C:\Program Files (x86)\Xiaomi\MiFlashUnlock\miflash_unlock.exe"
    )
    $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($found) {
        Write-Log "Mi Unlock bulundu, başlatılıyor: $found"
        Start-Process -FilePath $found
    } else {
        Write-Log "Mi Unlock yürütülebilir dosyası bulunamadı. Resmî indirme gerekir; otomatik kurulum yapılmadı." -Level WARN
    }
} else {
    Write-Log "Mi Unlock başlatılmadı (onay yok). -LaunchMiUnlock ile açık onay verilebilir."
}

if ($AssumeBootable) {
    Write-Log "AssumeBootable: kullanıcı kontrol listesi rapora eklenecek."
} else {
    Write-Log "Telefon normal açılmıyorsa yalnızca bağlantı/kilit teşhisi yapıldı; veri değiştiren işlem yok."
}

# ---- Rapor ----
$report = @"
# Xiaomi Mi Max 2 — Güvenli Teşhis Raporu

**Tarih:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Log:** ``$LogFile``

## Özet

| Alan | Değer |
|------|-------|
| Cihaz algılanma durumu | $($results.DeviceDetected) |
| Ürün kodu | $($results.Product) |
| Ürün / Mi Max 2 karşılaştırması | $($results.ProductMatch) |
| Bootloader (unlocked) | $($results.Unlocked) |
| Secure durumu | $($results.Secure) |
| Anti | $($results.Anti) |
| current-slot | $($results.CurrentSlot) |
| ROM bölgesi (CN/Global) | $($results.RomRegion) |
| Platform Tools | $($results.PlatformTools) |
| Tespit edilen muhtemel engel | $($results.LikelyBlocker) |
| Mi Unlock hata kategorisi | $($results.ErrorCategory.Category) |

## Desteklenmeyen / hatalı komutlar
$(if ($results.Unsupported.Count) { ($results.Unsupported | ForEach-Object { "- $_" }) -join "`n" } else { "- Yok" })

## Kanıt (komut çıktıları, kimlikler maskeli)
$(($results.Evidence | ForEach-Object { "- ``````$_``````" }) -join "`n")

## oem device-info
``````
$($results.OemDeviceInfo)
``````

## USB sürücü ipuçları
$(($results.XiaomiDrivers | ForEach-Object { "- $_" }) -join "`n")

$(if ($AssumeBootable) { Get-BootableChecklist } else {
"## Telefon durumu
Telefonun normal açılıp açılmadığı bu ajan tarafından doğrulanmadı.
- Açılabiliyorsa: ``-AssumeBootable`` ile yeniden çalıştırın veya kontrol listesini uygulayın.
- Açılmıyorsa: veri değiştiren işlem yapılmaz; yalnızca bu bağlantı/kilit teşhisi geçerlidir."
})

## $nextStep

## Güvenlik notu
Bu oturumda flash/erase/unlock/EDL/bypass komutları çalıştırılmadı ve önerilmedi.
"@

Set-Content -Path $ReportFile -Value $report -Encoding UTF8
Write-Log "Rapor yazıldı: $ReportFile"
Write-Log "=== Teşhis tamamlandı ==="

Write-Host ""
Write-Host "Rapor: $ReportFile" -ForegroundColor Green
Write-Host "Log:   $LogFile" -ForegroundColor Green
Write-Host "Muhtemel engel: $($results.LikelyBlocker)" -ForegroundColor Yellow

# Exit codes: 0=ok run, 1=no fastboot, 2=no device
if (-not $script:FastbootExe) { exit 1 }
if ($results.DeviceDetected -ne "evet") { exit 2 }
exit 0

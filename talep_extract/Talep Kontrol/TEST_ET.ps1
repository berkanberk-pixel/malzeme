$ErrorActionPreference = 'Continue'
$Root = [System.IO.Path]::GetFullPath([string]$PSScriptRoot)
$portFile = Join-Path ([System.IO.Path]::GetTempPath()) 'YEDAS_TalepKontrol_PORT.txt'
$installLog = Join-Path ([System.IO.Path]::GetTempPath()) 'YEDAS_TalepKontrol_PYTHON_INSTALL.log'
$startupLog = Join-Path ([System.IO.Path]::GetTempPath()) 'YEDAS_TalepKontrol_STARTUP.log'
$pythonFile = Join-Path ([System.IO.Path]::GetTempPath()) 'YEDAS_TalepKontrol_PYTHON.txt'
$port = '8765'
if (Test-Path -LiteralPath $portFile -PathType Leaf) {
    try { $port = (Get-Content -LiteralPath $portFile -TotalCount 1).Trim() } catch {}
}

function Section([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
}

Write-Host '================================================================'
Write-Host '  TALEP KONTROL - SERVIS / TASINABILIR PYTHON TESHIS'
Write-Host '================================================================'
Write-Host 'Paket : V3.13.0'
Write-Host ('Port  : ' + $port)
Write-Host ('Klasor: ' + $Root)
try {
    $cfgRaw = Get-Content -Raw -LiteralPath (Join-Path $Root 'config.json')
    $cfg = ConvertFrom-Json -InputObject $cfgRaw
    Write-Host ('Build : ' + $cfg.build)
} catch {
    Write-Host ('Build : config okunamadi - ' + $_.Exception.Message) -ForegroundColor Yellow
}

Section '[1] PowerShell bilgisi'
Write-Host ('PowerShell: ' + $PSVersionTable.PSVersion.ToString())
Write-Host ('Edition   : ' + $PSVersionTable.PSEdition)

Section '[2] PowerShell bootstrap soz dizimi kontrolu'
$parserHelper = Join-Path $Root 'POWERSHELL_KONTROL.ps1'
$bootstrap = Join-Path $Root 'PYTHON_BOOTSTRAP.ps1'
if (Test-Path -LiteralPath $parserHelper -PathType Leaf) {
    & $parserHelper -Target $bootstrap
    Write-Host ('Parser ExitCode: ' + $LASTEXITCODE)
} else {
    Write-Host 'HATA - POWERSHELL_KONTROL.ps1 bulunamadi.' -ForegroundColor Red
}

Section '[3] Python bootstrap kontrolu - indirme/kurulum yapmaz'
if (Test-Path -LiteralPath $bootstrap -PathType Leaf) {
    & $bootstrap -CheckOnly
    Write-Host ('Bootstrap CheckOnly ExitCode: ' + $LASTEXITCODE)
} else {
    Write-Host 'HATA - PYTHON_BOOTSTRAP.ps1 bulunamadi.' -ForegroundColor Red
}

Section '[4] Proje ici runtime'
$runtimeCandidates = @(
    (Join-Path $Root '_runtime\python313-amd64\python.exe'),
    (Join-Path $Root '_runtime\python313-arm64\python.exe'),
    (Join-Path $Root '_runtime\python313-win32\python.exe')
)
$runtimeFound = $false
foreach ($p in $runtimeCandidates) {
    if (Test-Path -LiteralPath $p -PathType Leaf) {
        $runtimeFound = $true
        Write-Host ('OK - runtime mevcut: ' + $p) -ForegroundColor Green
        try {
            $v = (& $p -I -V 2>&1 | Out-String).Trim()
            Write-Host ('     ' + $v + ' ExitCode=' + $LASTEXITCODE)
        } catch {
            Write-Host ('HATA - runtime calistirilamadi: ' + $_.Exception.Message) -ForegroundColor Red
        }
    }
}
if (-not $runtimeFound) { Write-Host 'BILGI - _runtime icinde python.exe henuz yok.' }

Section '[5] Sistem Python / PATH bilgisi'
try {
    $pyCmd = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pyCmd) {
        Write-Host ('py.exe: ' + $pyCmd.Source)
        try { & $pyCmd.Source -0p } catch {}
    } else { Write-Host 'py.exe bulunamadi.' }
} catch {}
try {
    $pythonCmds = @(Get-Command python.exe -All -ErrorAction SilentlyContinue)
    if ($pythonCmds.Count -eq 0) { Write-Host 'PATH uzerinde python.exe bulunamadi.' }
    foreach ($cmd in $pythonCmds) { Write-Host ('python.exe: ' + $cmd.Source) }
} catch {}
if (Test-Path -LiteralPath $pythonFile -PathType Leaf) {
    Write-Host 'Talep Kontrol secilen Python:'
    Get-Content -LiteralPath $pythonFile
}

Section '[6] Python/runtime logu'
if (Test-Path -LiteralPath $installLog -PathType Leaf) {
    Get-Content -LiteralPath $installLog -Tail 55
} else { Write-Host 'Python/runtime logu henuz olusmamis.' }

Section '[7] Yerel servis saglik kontrolu'
try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 ("http://127.0.0.1:{0}/api/health" -f $port)
    $j = ConvertFrom-Json -InputObject $r.Content
    $de = $j.dataEngine
    Write-Host ('OK - HTTP {0} - Version={1} Build={2} Engine={3} sourceIndexMatch={4}' -f $r.StatusCode,$j.version,$j.build,$de.status,$de.sourceIndexMatch) -ForegroundColor Green
} catch {
    Write-Host ('HATA - ' + $_.Exception.Message) -ForegroundColor Red
}

Section '[8] Port kullanim kontrolu'
try {
    $net = netstat -ano
    $matches = @($net | Select-String -Pattern (':' + [regex]::Escape([string]$port) + '\s+.*LISTENING'))
    if ($matches.Count -gt 0) { $matches | ForEach-Object { Write-Host $_.Line } }
    else { Write-Host ('BILGI - ' + $port + ' portunda LISTENING kaydi bulunamadi.') }
} catch { Write-Host ('Port kontrol hatasi: ' + $_.Exception.Message) }

Section '[9] Son uygulama baslatma kaydi'
if (Test-Path -LiteralPath $startupLog -PathType Leaf) { Get-Content -LiteralPath $startupLog -Tail 55 }
else { Write-Host 'Baslatma logu henuz olusmamis.' }

Section '[10] Paket temel dosyalari'
$files = @('POWERSHELL_KONTROL.ps1','PYTHON_BOOTSTRAP.ps1','PYTHON_RUNTIME_HAZIRLA.bat','windows_launcher.py','startup_runner.py','server.py','indexed_engine.py','parquet_minimal.py','index.html','app.js')
foreach ($f in $files) {
    $p = Join-Path $Root $f
    if (Test-Path -LiteralPath $p -PathType Leaf) { Write-Host ('OK   ' + $f) -ForegroundColor Green }
    else { Write-Host ('HATA ' + $f + ' bulunamadi') -ForegroundColor Red }
}

Section '--- Portable Python FIX23 bilgisi ---'
Write-Host 'Beklenen x64 dosya: python-3.13.17-embed-amd64.zip'
Write-Host ('Runtime klasoru: ' + (Join-Path $Root '_runtime\python313-amd64'))
Write-Host ('Offline paket klasoru: ' + (Join-Path $Root '_runtime_packages'))
Write-Host ('Python/runtime logu: ' + $installLog)

Write-Host ''
Write-Host 'Bu ekranin fotografini paylasirsaniz hata noktasi dogrudan gorulebilir.'
Write-Host '================================================================'

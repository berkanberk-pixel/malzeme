param(
    [switch]$CheckOnly,
    [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RequiredMajor = 3
$RequiredMinor = 10
$RuntimeVersion = '3.13.17'
$TempDir = [System.IO.Path]::GetTempPath()
$InstallLog = Join-Path $TempDir 'YEDAS_TalepKontrol_PYTHON_INSTALL.log'
$PythonPathFile = Join-Path $TempDir 'YEDAS_TalepKontrol_PYTHON.txt'
$Root = [System.IO.Path]::GetFullPath([string]$PSScriptRoot)
$RuntimeBase = Join-Path $Root '_runtime'
$RuntimePackages = Join-Path $Root '_runtime_packages'

function Write-InstallLog([string]$Message) {
    try {
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -LiteralPath $InstallLog -Value ("$stamp | $Message") -Encoding UTF8
    } catch {}
}

function Test-PythonExe([string]$Exe) {
    if ([string]::IsNullOrWhiteSpace($Exe)) { return $false }
    if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { return $false }
    try {
        # FIX21: Start-Process -ArgumentList ile "-c <kod>" gondermek Windows PowerShell'de
        # bosluk iceren Python kodunu parcaliyordu. Saglam python.exe bu nedenle hatali
        # bicimde "dogrulanamadi" sayiliyordu. Call operator (&) her argumani ayri ve
        # guvenli bicimde iletir.
        $versionText = (& $Exe -I -V 2>&1 | Out-String).Trim()
        $versionRc = $LASTEXITCODE
        if ($versionRc -ne 0) {
            Write-InstallLog "Python minimum kontrolu BASARISIZ ExitCode=${versionRc}: $Exe"
            if ($versionText) { Write-InstallLog ("python -V: " + $versionText) }
            return $false
        }
        Write-InstallLog "Python minimum kontrolu OK: $Exe | $versionText"

        $code = 'import sys,sqlite3,urllib.request,http.server,csv,zipfile,hashlib,pathlib,threading;raise SystemExit(0 if sys.version_info >= (3,10) else 9)'
        $moduleText = (& $Exe -I -c $code 2>&1 | Out-String).Trim()
        $moduleRc = $LASTEXITCODE
        if ($moduleRc -eq 0) {
            Write-InstallLog "Python modul kontrolu OK: $Exe"
            return $true
        }
        Write-InstallLog "Python modul kontrolu BASARISIZ ExitCode=${moduleRc}: $Exe"
        if ($moduleText) { Write-InstallLog ("Modul kontrolu: " + $moduleText) }
        return $false
    } catch {
        Write-InstallLog "Python kontrol hatasi: $Exe | $($_.Exception.Message)"
        return $false
    }
}

function Add-Candidate([System.Collections.Generic.List[string]]$List, [string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    try { $full = [System.IO.Path]::GetFullPath($Path) } catch { return }
    if ($full -like '*\WindowsApps\python*.exe') { return }
    if (-not $List.Contains($full)) { [void]$List.Add($full) }
}

function Get-ArchTag {
    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $arch = ([string]$arch).ToUpperInvariant()
    if ($arch -match 'ARM64') { return 'arm64' }
    if ($arch -match 'AMD64|X64') { return 'amd64' }
    return 'win32'
}

function Get-PortableInfo {
    $tag = Get-ArchTag
    switch ($tag) {
        'arm64' {
            return @{
                Tag='arm64'
                Name="python-$RuntimeVersion-embed-arm64.zip"
                Url="https://www.python.org/ftp/python/$RuntimeVersion/python-$RuntimeVersion-embed-arm64.zip"
                Sha256='7b58787a047b400edbfcb539aa3cdb4e2ed77bf0f22cae42b7c01cedd7dd6614'
            }
        }
        'amd64' {
            return @{
                Tag='amd64'
                Name="python-$RuntimeVersion-embed-amd64.zip"
                Url="https://www.python.org/ftp/python/$RuntimeVersion/python-$RuntimeVersion-embed-amd64.zip"
                Sha256='9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38'
            }
        }
        default {
            return @{
                Tag='win32'
                Name="python-$RuntimeVersion-embed-win32.zip"
                Url="https://www.python.org/ftp/python/$RuntimeVersion/python-$RuntimeVersion-embed-win32.zip"
                Sha256='4afd37bc88ed1391209a4c58deb902cd0741a476692412b23d340aff6e9285e7'
            }
        }
    }
}

function Get-RuntimeDir {
    $info = Get-PortableInfo
    return (Join-Path $RuntimeBase ("python313-" + $info.Tag))
}

function Set-EmbeddedPath([string]$RuntimeDir) {
    $pth = Join-Path $RuntimeDir 'python313._pth'
    if (-not (Test-Path -LiteralPath $pth -PathType Leaf)) { return }
    # Embeddable Python izole modda gelir. Uygulama kokunu import yoluna ekle.
    $lines = @('python313.zip','.', '..\..', '# import site')
    Set-Content -LiteralPath $pth -Value $lines -Encoding ASCII
}

function Find-Python {
    $candidates = New-Object 'System.Collections.Generic.List[string]'

    # 1) Proje icindeki tasinabilir runtime her zaman ilk tercih.
    $runtimeExe = Join-Path (Get-RuntimeDir) 'python.exe'
    Add-Candidate $candidates $runtimeExe

    # 2) Talep Kontrol/standart kullanici Python yolları.
    foreach ($v in @('315','314','313','312','311','310')) {
        if ($env:LOCALAPPDATA) { Add-Candidate $candidates (Join-Path $env:LOCALAPPDATA "Programs\Python\Python$v\python.exe") }
        if ($env:ProgramFiles) { Add-Candidate $candidates (Join-Path $env:ProgramFiles "Python$v\python.exe") }
        if (${env:ProgramFiles(x86)}) { Add-Candidate $candidates (Join-Path ${env:ProgramFiles(x86)} "Python$v\python.exe") }
    }

    # 3) Registry.
    foreach ($base in @('HKCU:\Software\Python\PythonCore','HKLM:\Software\Python\PythonCore','HKLM:\Software\WOW6432Node\Python\PythonCore')) {
        try {
            Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue | ForEach-Object {
                try {
                    $key = Get-Item -LiteralPath (Join-Path $_.PSPath 'InstallPath') -ErrorAction SilentlyContinue
                    $install = if ($key) { $key.GetValue('') } else { $null }
                    if ($install) { Add-Candidate $candidates (Join-Path $install 'python.exe') }
                } catch {}
            }
        } catch {}
    }

    # 4) PATH, Windows Store alias haric.
    try {
        Get-Command python.exe -All -ErrorAction SilentlyContinue | ForEach-Object {
            $src = $_.Source
            if ($src -and $src -notlike '*\WindowsApps\*') { Add-Candidate $candidates $src }
        }
    } catch {}

    foreach ($exe in $candidates) {
        if (Test-PythonExe $exe) {
            try { Set-Content -LiteralPath $PythonPathFile -Value $exe -Encoding ASCII } catch {}
            Write-InstallLog "Uygun Python bulundu: $exe"
            return $exe
        }
    }
    return $null
}

function Download-File([string]$Url, [string]$Destination) {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -TimeoutSec 180
        return
    } catch {
        Write-InstallLog "Invoke-WebRequest basarisiz: $($_.Exception.Message)"
    }
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { throw "Dosya indirilemedi ve curl.exe bulunamadi: $Url" }
    $p = Start-Process -FilePath $curl.Source -ArgumentList @('-L','--fail','--silent','--show-error','-o',"`"$Destination`"",$Url) -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "curl indirme hatasi. ExitCode=$($p.ExitCode)" }
}

function Test-Hash([string]$Path, [string]$Expected) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actual -ne $Expected.ToLowerInvariant()) {
        Write-InstallLog "SHA-256 HATA File=$Path Beklenen=$Expected Gelen=$actual"
        return $false
    }
    Write-InstallLog "SHA-256 OK: $actual | $Path"
    return $true
}

function Prepare-PortableRuntime {
    $info = Get-PortableInfo
    $runtimeDir = Get-RuntimeDir
    $runtimeExe = Join-Path $runtimeDir 'python.exe'

    if (Test-PythonExe $runtimeExe) {
        Set-EmbeddedPath $runtimeDir
        return $runtimeExe
    }

    New-Item -ItemType Directory -Force -Path $RuntimeBase | Out-Null
    New-Item -ItemType Directory -Force -Path $RuntimePackages | Out-Null

    $localArchive = Join-Path $RuntimePackages $info.Name
    $tempArchive = Join-Path $TempDir $info.Name
    $archive = $null

    # Kullanici resmi ZIP'i pakete onceden koyduysa internet gerekmez.
    if (Test-Hash $localArchive $info.Sha256) {
        $archive = $localArchive
        Write-InstallLog "Paket ici portable Python arsivi kullaniliyor: $archive"
    } else {
        if (Test-Path -LiteralPath $localArchive -PathType Leaf) {
            Write-InstallLog "Paket ici runtime arsivi hash gecersiz; kullanilmadi: $localArchive"
        }
        Write-Host "[PYTHON] Sistem Python bulunamadi. Tasinabilir Python $RuntimeVersion hazirlaniyor..."
        Write-Host "         Kurulum YOK; proje klasorune acilacak."
        Write-Host "         Ilk sefer internet baglantisi gereklidir."
        Write-InstallLog "Portable Python indiriliyor: $($info.Url)"
        Download-File $info.Url $tempArchive
        if (-not (Test-Hash $tempArchive $info.Sha256)) {
            Remove-Item -LiteralPath $tempArchive -Force -ErrorAction SilentlyContinue
            throw 'Tasinabilir Python SHA-256 dogrulamasi basarisiz.'
        }
        $archive = $tempArchive
    }

    $stage = Join-Path $RuntimeBase (".stage-python313-" + $info.Tag)
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force
    Set-EmbeddedPath $stage

    $stageExe = Join-Path $stage 'python.exe'
    if (-not (Test-PythonExe $stageExe)) {
        throw "Tasinabilir Python acildi ancak dogrulanamadi: $stageExe"
    }

    Remove-Item -LiteralPath $runtimeDir -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $stage -Destination $runtimeDir
    Set-EmbeddedPath $runtimeDir
    if (-not (Test-PythonExe $runtimeExe)) { throw "Runtime tasindiktan sonra dogrulanamadi: $runtimeExe" }

    try { Set-Content -LiteralPath $PythonPathFile -Value $runtimeExe -Encoding ASCII } catch {}
    if ($archive -eq $tempArchive) {
        try { Remove-Item -LiteralPath $tempArchive -Force -ErrorAction SilentlyContinue } catch {}
    }
    Write-InstallLog "Portable Python hazir: $runtimeExe"
    return $runtimeExe
}

function Get-PythonInstallerInfo {
    $tag = Get-ArchTag
    switch ($tag) {
        'arm64' { return @{ Name="python-$RuntimeVersion-arm64.exe"; Url="https://www.python.org/ftp/python/$RuntimeVersion/python-$RuntimeVersion-arm64.exe"; Sha256='3089a1977c32b26f5078e5a7d0285b7a861b8c96250c5dac3b6af59fbe9e9a75' } }
        'amd64' { return @{ Name="python-$RuntimeVersion-amd64.exe"; Url="https://www.python.org/ftp/python/$RuntimeVersion/python-$RuntimeVersion-amd64.exe"; Sha256='5da012101ba2e17113a9a1cd901e9ce1441086f2b7ecb5de06ec94163899a190' } }
        default { return @{ Name="python-$RuntimeVersion.exe"; Url="https://www.python.org/ftp/python/$RuntimeVersion/python-$RuntimeVersion.exe"; Sha256='91cd5b0293162e11c5599f80dc5bd14658cf086c8234a3117b58cfcb93c4eff3' } }
    }
}

function Install-PythonSilently {
    $info = Get-PythonInstallerInfo
    $installer = Join-Path $TempDir $info.Name
    $target = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313'
    Write-Host '[PYTHON] Portable runtime hazirlanamadi. Son care olarak resmi installer deneniyor...'
    Write-InstallLog "Installer fallback basliyor. Target=$target"
    Download-File $info.Url $installer
    if (-not (Test-Hash $installer $info.Sha256)) { throw 'Python installer SHA-256 dogrulamasi basarisiz.' }
    $args = @('/quiet','InstallAllUsers=0',"TargetDir=`"$target`"",'PrependPath=0','Include_exe=1','Include_lib=1','Include_tools=1','Include_pip=0','Include_launcher=0','Include_tcltk=0','Include_test=0','Include_doc=0','Shortcuts=0','CompileAll=0',"/log `"$InstallLog`"")
    $p = Start-Process -FilePath $installer -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
    Write-InstallLog "Python installer ExitCode=$($p.ExitCode)"
    if ($p.ExitCode -ne 0) { throw "Python kurulumu basarisiz. ExitCode=$($p.ExitCode)" }
    $exe = Join-Path $target 'python.exe'
    if (-not (Test-PythonExe $exe)) { throw "Python kuruldu ancak dogrulanamadi: $exe" }
    return $exe
}

try {
    Write-InstallLog ('=' * 72)
    Write-InstallLog "Bootstrap basladi. Root=$Root CheckOnly=$CheckOnly PrepareOnly=$PrepareOnly"

    # PrepareOnly dagitim hazirligi icindir: sistemde Python olsa bile
    # proje icindeki portable runtime'i zorla hazirlar.
    if ($PrepareOnly) {
        $python = Prepare-PortableRuntime
        Write-Host "[OK] Proje ici tasinabilir Python hazir: $python"
        Write-Host '[OK] Bu proje klasoru artik Python kurulumu olmadan baska Windows bilgisayarlara kopyalanabilir.'
        exit 0
    }

    $python = Find-Python

    if ($CheckOnly) {
        if ($python) {
            Write-Host "OK - Uygun Python: $python"
            if ($python -like "$RuntimeBase*") { Write-Host 'OK - Proje ici tasinabilir runtime aktif.' }
            exit 0
        }
        $info = Get-PortableInfo
        Write-Host 'BILGI - Python 3.10+ bulunamadi.'
        Write-Host ("Ilk BASLAT.bat calismasinda resmi tasinabilir runtime indirilecek: " + $info.Name)
        Write-Host ("Runtime klasoru: " + (Get-RuntimeDir))
        exit 10
    }

    if (-not $python) {
        try {
            $python = Prepare-PortableRuntime
            Write-Host "[OK] Tasinabilir Python hazir: $python"
        } catch {
            $portableError = $_.Exception.Message
            Write-InstallLog "Portable runtime hazirlama basarisiz: $portableError"
            Write-Host ''
            Write-Host ("[UYARI] Tasinabilir Python hazirlanamadi: " + $portableError) -ForegroundColor Yellow
            Write-Host ("        Runtime logu: " + $InstallLog) -ForegroundColor Yellow
            Write-Host "        Son care olarak resmi installer deneniyor..." -ForegroundColor Yellow
            $python = Install-PythonSilently
            Write-Host "[OK] Python installer fallback basarili: $python"
        }
    } else {
        Write-Host "[OK] Python bulundu: $python"
    }

    $launcher = Join-Path $Root 'windows_launcher.py'
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw "windows_launcher.py bulunamadi: $launcher" }
    Write-InstallLog "Windows launcher baslatiliyor: $python $launcher"
    # GUI startup: a hidden child console; its status is reported by START_GUI.ps1.
    $escapedLauncher = '"' + $launcher + '"'
    $child = Start-Process -FilePath $python -ArgumentList $escapedLauncher -WorkingDirectory $Root -WindowStyle Hidden -Wait -PassThru
    $rc = $child.ExitCode
    Write-InstallLog "Windows launcher ExitCode=$rc"
    exit $rc
}
catch {
    $msg = $_.Exception.Message
    Write-InstallLog "KRITIK: $msg"
    Write-Host ''
    Write-Host '[HATA] Python hazirlama/baslatma islemi tamamlanamadi.' -ForegroundColor Red
    Write-Host ("       " + $msg) -ForegroundColor Red
    Write-Host ("       Log: " + $InstallLog)
    exit 90
}

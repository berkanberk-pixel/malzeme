param([Parameter(Mandatory=$true)][string]$State)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$cache=Join-Path $env:LOCALAPPDATA 'TalepKontrol\WebView2SDK'
$version='1.0.4314.35'
$dest=Join-Path $cache $version
$manifest=Join-Path $dest '.ok'
try {
    $required=@('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')
    $valid=(Test-Path -LiteralPath $manifest)
    foreach ($needed in $required) { if (!(Test-Path -LiteralPath (Join-Path $dest $needed))) { $valid=$false } }
    if (!$valid) {
        New-Item -ItemType Directory -Force -Path $cache | Out-Null
        $zip=Join-Path $cache ('Microsoft.Web.WebView2.'+$version+'.zip')
        $stage=Join-Path $cache ('.stage-'+[guid]::NewGuid().ToString('N'))
        $url='https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/'+$version
        try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip -TimeoutSec 150
        New-Item -ItemType Directory -Force -Path $stage | Out-Null
        Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
        $core=Get-ChildItem -LiteralPath $stage -Recurse -File -Filter 'Microsoft.Web.WebView2.Core.dll' | Where-Object { $_.FullName -match '(net462|net45|net48)' } | Select-Object -First 1
        $forms=Get-ChildItem -LiteralPath $stage -Recurse -File -Filter 'Microsoft.Web.WebView2.WinForms.dll' | Where-Object { $_.FullName -match '(net462|net45|net48)' } | Select-Object -First 1
        $native=Get-ChildItem -LiteralPath $stage -Recurse -File -Filter 'WebView2Loader.dll' | Where-Object { $_.FullName -match '(x64|win-x64)' } | Select-Object -First 1
        if (!$core -or !$forms -or !$native) { throw 'WebView2 paketi gerekli Windows .NET bileşenlerini içermiyor.' }
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        Copy-Item -LiteralPath $core.FullName -Destination (Join-Path $dest $core.Name) -Force
        Copy-Item -LiteralPath $forms.FullName -Destination (Join-Path $dest $forms.Name) -Force
        Copy-Item -LiteralPath $native.FullName -Destination (Join-Path $dest $native.Name) -Force
        $all=@('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')
        foreach($name in $all) {
            $candidate=Join-Path $dest $name
            if (!(Test-Path -LiteralPath $candidate) -or (Get-Item $candidate).Length -lt 10240) { throw "WebView2 bileşeni doğrulanamadı: $name" }
        }
        Set-Content -LiteralPath $manifest -Value ('Version='+$version+' PackageSHA256='+(Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash) -Encoding ASCII
        Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
    Set-Content -LiteralPath $State -Value ('OK|'+$dest) -Encoding UTF8
    exit 0
} catch {
    Set-Content -LiteralPath $State -Value ('FAILED|'+$_.Exception.Message) -Encoding UTF8
    exit 1
}

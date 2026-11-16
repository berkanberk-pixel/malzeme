param(
    [Parameter(Mandatory=$true)]
    [string]$Target,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

try {
    if (-not (Test-Path -LiteralPath $Target -PathType Leaf)) {
        Write-Host ('[HATA] PowerShell dosyasi bulunamadi: ' + $Target) -ForegroundColor Red
        exit 93
    }

    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $Target,
        [ref]$tokens,
        [ref]$errors
    )

    if ($null -ne $errors -and $errors.Count -gt 0) {
        Write-Host ''
        Write-Host '[HATA] PowerShell soz dizimi hatasi:' -ForegroundColor Red
        foreach ($err in $errors) {
            $line = $err.Extent.StartLineNumber
            $message = $err.Message
            Write-Host ('  Satir {0}: {1}' -f $line, $message) -ForegroundColor Red
        }
        exit 92
    }

    if (-not $Quiet) {
        Write-Host ('OK - PowerShell parser kontrolu gecti: ' + $Target) -ForegroundColor Green
    }
    exit 0
}
catch {
    Write-Host ('[HATA] PowerShell parser kontrolu calistirilamadi: ' + $_.Exception.Message) -ForegroundColor Red
    exit 94
}

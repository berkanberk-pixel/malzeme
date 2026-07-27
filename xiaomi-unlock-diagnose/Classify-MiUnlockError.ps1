#Requires -Version 5.1
<#
.SYNOPSIS
  Mi Unlock hata mesajını / kodunu güvenli kategorilere ayırır.
.EXAMPLE
  .\Classify-MiUnlockError.ps1 -Message "Couldn't verify, wait 168 hours"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Message
)

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptRoot "_Classify.ps1")

$result = Invoke-MiUnlockErrorClassify -Msg $Message
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output ("Kategori: {0}" -f $result.Category)
Write-Output ("Gerekce:  {0}" -f $result.Reason)

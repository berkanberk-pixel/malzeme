# Excel 97-2003 (.xls) and binary (.xlsb) are converted READ-ONLY via MS Excel COM.
# Never executes workbook macros, never overwrites originals.
$ErrorActionPreference='Stop'
$src=$env:TALEP_EXCEL_SOURCE
$dst=$env:TALEP_EXCEL_TARGET
if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw 'Excel kaynağı bulunamadı.' }
$excel=$null; $book=$null
try {
    $excel=New-Object -ComObject Excel.Application
    $excel.Visible=$false
    $excel.DisplayAlerts=$false
    $excel.AskToUpdateLinks=$false
    $excel.AutomationSecurity=3 # msoAutomationSecurityForceDisable
    $book=$excel.Workbooks.Open($src,0,$true)
    $book.SaveAs($dst,51) # xlsx without macros
} finally {
    if ($book -ne $null) { try{$book.Close($false)}catch{};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($book) }
    if ($excel -ne $null) {try{$excel.Quit()}catch{};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)}
    [GC]::Collect();[GC]::WaitForPendingFinalizers()
}

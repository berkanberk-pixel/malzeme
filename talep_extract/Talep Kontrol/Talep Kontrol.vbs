Option Explicit
Dim sh, fso, root, ps, cmd, code
Set sh=CreateObject("WScript.Shell")
Set fso=CreateObject("Scripting.FileSystemObject")
root=fso.GetParentFolderName(WScript.ScriptFullName)
ps=fso.BuildPath(root,"START_GUI.ps1")
If Not fso.FileExists(ps) Then
  MsgBox "Talep Kontrol açılış dosyası bulunamadı.",16,"Talep Kontrol"
  WScript.Quit 2
End If
cmd="powershell.exe -NoLogo -NoProfile -STA -WindowStyle Hidden -File " & Chr(34) & ps & Chr(34)
On Error Resume Next
code=sh.Run(cmd,0,True)
If Err.Number<>0 Then
  MsgBox "Talep Kontrol başlatılamadı. Windows çalıştırma izinlerini kontrol ettirin.",16,"Talep Kontrol"
  WScript.Quit 3
End If
If code<>0 Then
  MsgBox "Talep Kontrol açılamadı. Gerekli bileşenler veya çalışma izinleri eksik olabilir.",48,"Talep Kontrol"
End If

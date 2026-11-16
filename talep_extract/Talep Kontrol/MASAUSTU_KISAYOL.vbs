Option Explicit
Dim sh, fso, folder, root, link, desktop, startMenu, icon
Set sh=CreateObject("WScript.Shell")
Set fso=CreateObject("Scripting.FileSystemObject")
root=fso.GetParentFolderName(WScript.ScriptFullName)
icon=fso.BuildPath(root,"assets\brand\talep-kontrol.ico")
desktop=sh.SpecialFolders("Desktop")
Set link=sh.CreateShortcut(fso.BuildPath(desktop,"Talep Kontrol.lnk"))
link.TargetPath=sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
link.Arguments=Chr(34) & fso.BuildPath(root,"Talep Kontrol.vbs") & Chr(34)
link.WorkingDirectory=root
link.Description="Talep Kontrol"
If fso.FileExists(icon) Then link.IconLocation=icon & ",0"
link.Save
MsgBox "Talep Kontrol masaüstü kısayolu oluşturuldu.",64,"Talep Kontrol"

Option Explicit
Dim sh, fso, root
Set sh=CreateObject("WScript.Shell")
Set fso=CreateObject("Scripting.FileSystemObject")
root=fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "wscript.exe " & Chr(34) & fso.BuildPath(root,"Talep Kontrol.vbs") & Chr(34),0,False

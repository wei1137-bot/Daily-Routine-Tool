Option Explicit

Dim shell, fileSystem, baseDirectory, electronCommand
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
baseDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
electronCommand = baseDirectory & "\node_modules\.bin\electron.cmd"
shell.CurrentDirectory = baseDirectory
shell.Run """" & electronCommand & """ .", 0, False
Set shell = Nothing
Set fileSystem = Nothing

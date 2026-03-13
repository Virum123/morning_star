$path = "C:\Users\Administrator\Desktop\Morning Star.lnk"
$wshell = New-Object -ComObject WScript.Shell
$shortcut = $wshell.CreateShortcut($path)
$shortcut.TargetPath = "C:\Users\Administrator\Desktop\new\morning_star\dist\Morning Star\Morning Star.exe"
$shortcut.WorkingDirectory = "C:\Users\Administrator\Desktop\new\morning_star\dist\Morning Star"
$shortcut.IconLocation = "C:\Users\Administrator\Desktop\new\morning_star\morning_star.ico"
$shortcut.Save()

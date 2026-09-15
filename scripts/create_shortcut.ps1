$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "YT Music Lite.lnk"

$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)

$scriptDir = Split-Path -Parent $PSScriptRoot
$trayScript = Join-Path $scriptDir "tray.py"
$iconPath = Join-Path $scriptDir "client\public\icons\icon3.ico"

$sc.TargetPath = "pythonw.exe"
$sc.Arguments = "`"$trayScript`""
$sc.WorkingDirectory = $scriptDir
$sc.IconLocation = "$iconPath,0"
$sc.Description = "YT Music Lite - Mini Reproductor Ultra Ligero"
$sc.Save()

Write-Host "Acceso directo creado exitosamente: $shortcutPath"

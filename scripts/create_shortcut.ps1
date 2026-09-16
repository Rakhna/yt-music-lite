$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "YT Music Lite.lnk"

$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)

$scriptDir = Split-Path -Parent $PSScriptRoot
$trayScript = Join-Path $scriptDir "tray.py"
$prefFile = Join-Path $scriptDir "icon_choice.txt"
$iconName = "icon3.ico"
if (Test-Path $prefFile) {
    $choice = (Get-Content $prefFile).Trim()
    if ($choice -match "^icon[1-3]$") {
        $iconName = "$choice.ico"
    }
}
$iconPath = Join-Path $scriptDir "client\public\icons\$iconName"

$sc.TargetPath = "pythonw.exe"
$sc.Arguments = "`"$trayScript`""
$sc.WorkingDirectory = $scriptDir
$sc.IconLocation = "$iconPath,0"
$sc.Description = "YT Music Lite - Mini Reproductor Ultra Ligero"
$sc.Save()

Write-Host "Acceso directo creado exitosamente: $shortcutPath"

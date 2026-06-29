param(
  [switch] $KeepAppFiles,
  [switch] $Quiet,
  [string] $InstallRoot = ""
)

$ErrorActionPreference = "Stop"

$HostName = "com.gormanity.ytm_enhancer.tray"
$RegistryKeys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
)

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA "YTM Enhancer\Tray"
}

$StartMenuFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\YTM Enhancer"
$StartMenuAppShortcutPath = Join-Path $StartMenuFolder "YTM Tray.lnk"
$StartMenuUninstallShortcutPath = Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk"
$UninstallRegistryKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray"

function Write-Status {
  param([Parameter(Mandatory = $true)][string] $Message)

  if (-not $Quiet) {
    Write-Output $Message
  }
}

function Remove-StartMenuShortcuts {
  foreach ($ShortcutPath in @($StartMenuAppShortcutPath, $StartMenuUninstallShortcutPath)) {
    if (Test-Path -LiteralPath $ShortcutPath) {
      Remove-Item -LiteralPath $ShortcutPath -Force
      Write-Status "Removed $ShortcutPath"
    }
  }

  if ((Test-Path -LiteralPath $StartMenuFolder) -and -not (Get-ChildItem -LiteralPath $StartMenuFolder -Force)) {
    Remove-Item -LiteralPath $StartMenuFolder -Force
    Write-Status "Removed $StartMenuFolder"
  }
}

function Unregister-UninstallEntry {
  if (Test-Path -LiteralPath $UninstallRegistryKey) {
    Remove-Item -LiteralPath $UninstallRegistryKey -Recurse -Force
    Write-Status "Removed $UninstallRegistryKey"
  }
}

foreach ($RegistryKey in $RegistryKeys) {
  if (Test-Path -LiteralPath $RegistryKey) {
    Remove-Item -LiteralPath $RegistryKey -Recurse -Force
    Write-Status "Removed $RegistryKey"
  }
}

Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

Remove-StartMenuShortcuts
Unregister-UninstallEntry

if (-not $KeepAppFiles -and (Test-Path -LiteralPath $InstallRoot)) {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
  Write-Status "Removed $InstallRoot"
}

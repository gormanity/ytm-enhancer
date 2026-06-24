param(
  [switch] $KeepAppFiles,
  [string] $InstallRoot = ""
)

$ErrorActionPreference = "Stop"

$HostName = "com.gormanity.ytm_enhancer.tray"
$RegistryKeys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
)

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA "YTM Enhancer\Tray"
}

foreach ($RegistryKey in $RegistryKeys) {
  if (Test-Path -LiteralPath $RegistryKey) {
    Remove-Item -LiteralPath $RegistryKey -Recurse -Force
    Write-Output "Removed $RegistryKey"
  }
}

Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

if (-not $KeepAppFiles -and (Test-Path -LiteralPath $InstallRoot)) {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
  Write-Output "Removed $InstallRoot"
}

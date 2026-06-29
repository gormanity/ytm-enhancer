param(
  [ValidateSet("win-x64", "win-arm64")]
  [string] $RuntimeIdentifier = "",
  [string] $InstallRoot = "",
  [string[]] $AdditionalAllowedOrigins = @()
)

$ErrorActionPreference = "Stop"

$HostName = "com.gormanity.ytm_enhancer.tray"
$Description = "YTM Enhancer Windows Tray Connector"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Resolve-Path (Join-Path $ScriptRoot "..")
$TrayProjectPath = Join-Path $AppRoot "src\YTMTray\YTMTray.csproj"
$NativeHostProjectPath = Join-Path $AppRoot "src\YTMTray.NativeHost\YTMTray.NativeHost.csproj"
$PackagedExecutablePath = Join-Path $ScriptRoot "YTMTray.exe"
$PackagedNativeHostExecutablePath = Join-Path $ScriptRoot "YTMTray.NativeHost.exe"
$PackagedUninstallerPath = Join-Path $ScriptRoot "uninstall-native-hosts.ps1"
$PackagedReleaseMetadataPath = Join-Path $ScriptRoot "release.json"

if ([string]::IsNullOrWhiteSpace($RuntimeIdentifier)) {
  $RuntimeIdentifier = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
    "win-arm64"
  } else {
    "win-x64"
  }
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA "YTM Enhancer\Tray"
}

$ExecutablePath = Join-Path $InstallRoot "YTMTray.exe"
$NativeHostExecutablePath = Join-Path $InstallRoot "YTMTray.NativeHost.exe"
$UninstallerPath = Join-Path $InstallRoot "uninstall-native-hosts.ps1"
$UninstallCommandPath = Join-Path $InstallRoot "Uninstall YTM Tray.cmd"
$ReleaseMetadataPath = Join-Path $InstallRoot "release.json"
$ManifestPath = Join-Path $InstallRoot "$HostName.json"
$FirefoxManifestPath = Join-Path $InstallRoot "$HostName.firefox.json"
$BackupRoot = Join-Path ([System.IO.Path]::GetTempPath()) "ytm-tray-install-backup-$([Guid]::NewGuid().ToString("N"))"
$StartMenuFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\YTM Enhancer"
$StartMenuAppShortcutPath = Join-Path $StartMenuFolder "YTM Tray.lnk"
$StartMenuUninstallShortcutPath = Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk"
$UninstallRegistryKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray"
$InstalledFiles = @(
  "YTMTray.exe",
  "YTMTray.NativeHost.exe",
  "uninstall-native-hosts.ps1",
  "Uninstall YTM Tray.cmd",
  "release.json",
  "$HostName.json",
  "$HostName.firefox.json"
)
$DefaultAllowedOrigins = @(
  "chrome-extension://pggblbpjleekkobiinobaeeefnimgljh/",
  "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/",
  "chrome-extension://bilcedjabgiedoamakekncokccabdccp/",
  "chrome-extension://gamefnibdabclmkngggcjghpbhjmajkm/"
)
$DefaultAllowedFirefoxExtensions = @(
  "ytm-enhancer@gormanity"
)
$RegistryKeys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
)
$RegistryBackup = @{}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [string[]] $Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

function Normalize-AllowedOrigin {
  param([Parameter(Mandatory = $true)][string] $Origin)

  $TrimmedOrigin = $Origin.Trim()
  if ($TrimmedOrigin -match "^[a-p]{32}$") {
    $TrimmedOrigin = "chrome-extension://$TrimmedOrigin/"
  }

  if ($TrimmedOrigin -notmatch "^chrome-extension://[a-p]{32}/$") {
    throw "Invalid native messaging origin: $Origin"
  }

  return $TrimmedOrigin
}

function Test-PackagedBinaries {
  return (
    (Test-Path -LiteralPath $PackagedExecutablePath) -and
    (Test-Path -LiteralPath $PackagedNativeHostExecutablePath)
  )
}

function Publish-FromSource {
  if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw ".NET 10 SDK is required when installing from source. Install it before running this script, or use a release package."
  }

  Invoke-Native -FilePath dotnet -Arguments @(
    "publish",
    $TrayProjectPath,
    "-c",
    "Release",
    "-r",
    $RuntimeIdentifier,
    "--self-contained",
    "true",
    "/p:PublishSingleFile=true",
    "/p:IncludeNativeLibrariesForSelfExtract=true",
    "/p:EnableCompressionInSingleFile=true",
    "-o",
    $InstallRoot
  )

  Invoke-Native -FilePath dotnet -Arguments @(
    "publish",
    $NativeHostProjectPath,
    "-c",
    "Release",
    "-r",
    $RuntimeIdentifier,
    "--self-contained",
    "true",
    "/p:PublishSingleFile=true",
    "/p:IncludeNativeLibrariesForSelfExtract=true",
    "/p:EnableCompressionInSingleFile=true",
    "-o",
    $InstallRoot
  )
}

function Install-PackagedBinaries {
  Copy-Item -LiteralPath $PackagedExecutablePath -Destination $ExecutablePath -Force
  Copy-Item -LiteralPath $PackagedNativeHostExecutablePath -Destination $NativeHostExecutablePath -Force
  if (Test-Path -LiteralPath $PackagedReleaseMetadataPath) {
    Copy-Item -LiteralPath $PackagedReleaseMetadataPath -Destination $ReleaseMetadataPath -Force
  }
}

function Install-UninstallerScript {
  if (Test-Path -LiteralPath $PackagedUninstallerPath) {
    Copy-Item -LiteralPath $PackagedUninstallerPath -Destination $UninstallerPath -Force
  }
}

function Write-UninstallCommand {
  $Command = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-native-hosts.ps1"
"@
  Set-Content -LiteralPath $UninstallCommandPath -Value $Command -Encoding ascii
}

function Save-InstallBackup {
  if (-not (Test-Path -LiteralPath $InstallRoot)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
  foreach ($InstalledFile in $InstalledFiles) {
    $SourcePath = Join-Path $InstallRoot $InstalledFile
    if (Test-Path -LiteralPath $SourcePath) {
      Copy-Item -LiteralPath $SourcePath -Destination (Join-Path $BackupRoot $InstalledFile) -Force
    }
  }
}

function Save-RegistryBackup {
  foreach ($RegistryKey in $RegistryKeys) {
    if (Test-Path -LiteralPath $RegistryKey) {
      $RegistryBackup[$RegistryKey] = @{
        exists = $true
        value = (Get-Item -LiteralPath $RegistryKey).GetValue("")
      }
    } else {
      $RegistryBackup[$RegistryKey] = @{ exists = $false }
    }
  }
}

function Restore-InstallBackup {
  foreach ($InstalledFile in $InstalledFiles) {
    $InstallPath = Join-Path $InstallRoot $InstalledFile
    $BackupPath = Join-Path $BackupRoot $InstalledFile

    if (Test-Path -LiteralPath $BackupPath) {
      Copy-Item -LiteralPath $BackupPath -Destination $InstallPath -Force
    } elseif (Test-Path -LiteralPath $InstallPath) {
      Remove-Item -LiteralPath $InstallPath -Force
    }
  }
}

function Restore-RegistryBackup {
  foreach ($RegistryKey in $RegistryKeys) {
    $Previous = $RegistryBackup[$RegistryKey]
    if ($Previous -and $Previous.exists) {
      New-Item -Path $RegistryKey -Force | Out-Null
      Set-Item -Path $RegistryKey -Value $Previous.value
    } elseif (Test-Path -LiteralPath $RegistryKey) {
      Remove-Item -LiteralPath $RegistryKey -Recurse -Force
    }
  }
}

function Install-Shortcut {
  param(
    [Parameter(Mandatory = $true)]
    [string] $ShortcutPath,
    [Parameter(Mandatory = $true)]
    [string] $TargetPath,
    [string] $Arguments = ""
  )

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ShortcutPath) | Out-Null
  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = $TargetPath
  $Shortcut.Arguments = $Arguments
  $Shortcut.WorkingDirectory = $InstallRoot
  $Shortcut.IconLocation = "$ExecutablePath,0"
  $Shortcut.Save()
}

function Install-StartMenuShortcuts {
  Install-Shortcut `
    -ShortcutPath $StartMenuAppShortcutPath `
    -TargetPath $ExecutablePath
  Install-Shortcut `
    -ShortcutPath $StartMenuUninstallShortcutPath `
    -TargetPath "powershell.exe" `
    -Arguments "-NoProfile -ExecutionPolicy Bypass -File `"$UninstallerPath`""
}

function Remove-StartMenuShortcuts {
  foreach ($ShortcutPath in @($StartMenuAppShortcutPath, $StartMenuUninstallShortcutPath)) {
    if (Test-Path -LiteralPath $ShortcutPath) {
      Remove-Item -LiteralPath $ShortcutPath -Force
    }
  }

  if ((Test-Path -LiteralPath $StartMenuFolder) -and -not (Get-ChildItem -LiteralPath $StartMenuFolder -Force)) {
    Remove-Item -LiteralPath $StartMenuFolder -Force
  }
}

function Get-InstalledVersion {
  if (Test-Path -LiteralPath $ReleaseMetadataPath) {
    $ReleaseMetadata = Get-Content -LiteralPath $ReleaseMetadataPath -Raw | ConvertFrom-Json
    if (-not [string]::IsNullOrWhiteSpace($ReleaseMetadata.version)) {
      return $ReleaseMetadata.version
    }
  }

  return "0.1.0"
}

function Register-UninstallEntry {
  New-Item -Path $UninstallRegistryKey -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "DisplayName" -Value "YTM Tray" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "DisplayVersion" -Value (Get-InstalledVersion) -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "Publisher" -Value "YTM Enhancer" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "InstallLocation" -Value $InstallRoot -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "DisplayIcon" -Value "$ExecutablePath,0" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "UninstallString" -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$UninstallerPath`"" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "QuietUninstallString" -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$UninstallerPath`" -Quiet" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "NoModify" -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $UninstallRegistryKey -Name "NoRepair" -Value 1 -PropertyType DWord -Force | Out-Null
}

function Unregister-UninstallEntry {
  if (Test-Path -LiteralPath $UninstallRegistryKey) {
    Remove-Item -LiteralPath $UninstallRegistryKey -Recurse -Force
  }
}

function Remove-InstallBackup {
  if (Test-Path -LiteralPath $BackupRoot) {
    Remove-Item -LiteralPath $BackupRoot -Recurse -Force
  }
}

Save-InstallBackup
Save-RegistryBackup
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

try {
  if (Test-PackagedBinaries) {
    Install-PackagedBinaries
  } else {
    Publish-FromSource
  }
  Install-UninstallerScript

  $AllowedOrigins = @(
    $DefaultAllowedOrigins
    $AdditionalAllowedOrigins | ForEach-Object { Normalize-AllowedOrigin $_ }
  ) | Select-Object -Unique

  $Manifest = @{
    name = $HostName
    description = $Description
    path = $NativeHostExecutablePath
    type = "stdio"
    allowed_origins = $AllowedOrigins
  }

  $FirefoxManifest = @{
    name = $HostName
    description = $Description
    path = $NativeHostExecutablePath
    type = "stdio"
    allowed_extensions = $DefaultAllowedFirefoxExtensions
  }

  $Manifest |
    ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath $ManifestPath -Encoding utf8

  $FirefoxManifest |
    ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath $FirefoxManifestPath -Encoding utf8

  foreach ($RegistryKey in $RegistryKeys) {
    New-Item -Path $RegistryKey -Force | Out-Null
    $RegistryValue = if ($RegistryKey -like "HKCU:\Software\Mozilla\*") {
      $FirefoxManifestPath
    } else {
      $ManifestPath
    }
    Set-Item -Path $RegistryKey -Value $RegistryValue
    Write-Output "Installed $RegistryKey -> $RegistryValue"
  }

  Write-UninstallCommand
  Install-StartMenuShortcuts
  Register-UninstallEntry

  Write-Output "Installed $ExecutablePath"
  Write-Output "Installed $NativeHostExecutablePath"
  Write-Output "Registered Windows uninstall entry"
  Write-Output "Open YTM Tray, then enable Connected Apps in YTM Enhancer."
} catch {
  Remove-StartMenuShortcuts
  Unregister-UninstallEntry
  Restore-InstallBackup
  Restore-RegistryBackup
  throw
} finally {
  Remove-InstallBackup
}

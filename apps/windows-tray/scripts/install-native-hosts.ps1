param(
  [ValidateSet("win-x64", "win-arm64")]
  [string] $RuntimeIdentifier = "",
  [string] $InstallRoot = "",
  [string[]] $AdditionalAllowedOrigins = @(),
  [switch] $InstallerWorker,
  [string] $InstallerLogPath = ""
)

$ErrorActionPreference = "Stop"

$HostName = "com.gormanity.ytm_enhancer.tray"
$Description = "YTM Enhancer Windows Tray Connector"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallerScriptPath = if ($PSCommandPath) {
  $PSCommandPath
} else {
  $MyInvocation.MyCommand.Path
}
$AppRoot = Resolve-Path (Join-Path $ScriptRoot "..")
$TrayProjectPath = Join-Path $AppRoot "src\YTMTray\YTMTray.csproj"
$NativeHostProjectPath = Join-Path $AppRoot "src\YTMTray.NativeHost\YTMTray.NativeHost.csproj"
$PackagedExecutablePath = Join-Path $ScriptRoot "YTMTray.exe"
$PackagedNativeHostExecutablePath = Join-Path $ScriptRoot "YTMTray.NativeHost.exe"
$PackagedSetupExecutablePath = Join-Path $ScriptRoot "YTMTray.Setup.exe"
$PackagedUninstallerPath = Join-Path $ScriptRoot "uninstall-native-hosts.ps1"
$PackagedReleaseMetadataPath = Join-Path $ScriptRoot "release.json"
$CompatibilityRunnerPath = Join-Path $ScriptRoot "run-update-installer.ps1"
$InstallRootWasSpecified = -not [string]::IsNullOrWhiteSpace($InstallRoot)

function ConvertTo-NativeProcessArgument {
  param([Parameter(Mandatory = $true)][string] $Value)

  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') {
    return $Value
  }

  return '"' + (($Value -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}

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

if (Test-Path -LiteralPath $PackagedSetupExecutablePath) {
  $NativeSetupArguments = @(
    "install",
    "--quiet",
    "--runtime-identifier",
    $RuntimeIdentifier
  )
  if ($InstallRootWasSpecified) {
    $NativeSetupArguments += @("--install-root", $InstallRoot)
  }
  foreach ($Origin in $AdditionalAllowedOrigins) {
    $NativeSetupArguments += @("--additional-allowed-origin", $Origin)
  }

  $NativeSetupCommandLine = @(
    $NativeSetupArguments | ForEach-Object {
      ConvertTo-NativeProcessArgument $_
    }
  ) -join " "
  $NativeSetupProcess = Start-Process `
    -FilePath $PackagedSetupExecutablePath `
    -ArgumentList $NativeSetupCommandLine `
    -WorkingDirectory $ScriptRoot `
    -Wait `
    -PassThru
  if ($NativeSetupProcess.ExitCode -ne 0) {
    throw "YTMTray.Setup.exe exited with code $($NativeSetupProcess.ExitCode)"
  }
  return
}

if ([string]::IsNullOrWhiteSpace($InstallerLogPath)) {
  $InstallerLogPath = Join-Path $ScriptRoot "update-installer.log"
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
$FirefoxRegistry64Backup = @{ exists = $false }
$FirefoxRegistrySubKey = "Software\Mozilla\NativeMessagingHosts\$HostName"

function Open-CurrentUserRegistry64 {
  return [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::CurrentUser,
    [Microsoft.Win32.RegistryView]::Registry64
  )
}

function Save-FirefoxRegistry64Backup {
  $BaseKey = Open-CurrentUserRegistry64
  try {
    $Key = $BaseKey.OpenSubKey($FirefoxRegistrySubKey)
    if ($Key) {
      try {
        $script:FirefoxRegistry64Backup = @{
          exists = $true
          value = $Key.GetValue("")
        }
      } finally {
        $Key.Dispose()
      }
    }
  } finally {
    $BaseKey.Dispose()
  }
}

function Set-FirefoxRegistry64Value {
  param([Parameter(Mandatory = $true)][string] $Value)

  $BaseKey = Open-CurrentUserRegistry64
  try {
    $Key = $BaseKey.CreateSubKey($FirefoxRegistrySubKey, $true)
    try {
      $Key.SetValue("", $Value, [Microsoft.Win32.RegistryValueKind]::String)
    } finally {
      $Key.Dispose()
    }
  } finally {
    $BaseKey.Dispose()
  }
}

function Restore-FirefoxRegistry64Backup {
  $BaseKey = Open-CurrentUserRegistry64
  try {
    if ($FirefoxRegistry64Backup.exists) {
      $Key = $BaseKey.CreateSubKey($FirefoxRegistrySubKey, $true)
      try {
        $Key.SetValue(
          "",
          $FirefoxRegistry64Backup.value,
          [Microsoft.Win32.RegistryValueKind]::String
        )
      } finally {
        $Key.Dispose()
      }
    } else {
      $BaseKey.DeleteSubKeyTree($FirefoxRegistrySubKey, $false)
    }
  } finally {
    $BaseKey.Dispose()
  }
}

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

function ConvertTo-PowerShellLiteral {
  param([Parameter(Mandatory = $true)][string] $Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

function ConvertTo-ProcessArgument {
  param([Parameter(Mandatory = $true)][string] $Value)
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Get-RunningTrayProcesses {
  return @(
    Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue
  )
}

function Stop-RunningTrayProcesses {
  $Processes = Get-RunningTrayProcesses
  if ($Processes.Count -eq 0) {
    return
  }

  $ProcessIds = @($Processes | ForEach-Object { $_.Id })
  $Processes | Stop-Process -Force -ErrorAction SilentlyContinue
  foreach ($ProcessId in $ProcessIds) {
    try {
      Wait-Process -Id $ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    } catch {}
  }
  Start-Sleep -Milliseconds 750
}

function Copy-ItemWithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [string] $LiteralPath,
    [Parameter(Mandatory = $true)]
    [string] $Destination,
    [int] $TimeoutSeconds = 30
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $LastError = $null
  do {
    try {
      Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force
      return
    } catch [System.IO.IOException], [System.UnauthorizedAccessException] {
      $LastError = $_
      Start-Sleep -Milliseconds 300
    }
  } while ((Get-Date) -lt $Deadline)

  throw $LastError
}

function Start-DetachedInstallerWorker {
  $AdditionalOriginValues = if ($AdditionalAllowedOrigins.Count -gt 0) {
    ($AdditionalAllowedOrigins | ForEach-Object { ConvertTo-PowerShellLiteral $_ }) -join ", "
  } else {
    ""
  }

  $RunnerScript = @(
    '$ErrorActionPreference = "Stop"',
    '$ProgressPreference = "SilentlyContinue"',
    "`$InstallerScriptPath = $(ConvertTo-PowerShellLiteral $InstallerScriptPath)",
    "`$LogPath = $(ConvertTo-PowerShellLiteral $InstallerLogPath)",
    "function Write-InstallerLog {",
    "  param([Parameter(Mandatory = `$true)][string] `$Message)",
    '  Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o) $Message" -Encoding utf8',
    "}",
    "try {",
    '  Write-InstallerLog "compatibility installer worker started"',
    '  $Processes = @(Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue)',
    '  if ($Processes.Count -gt 0) {',
    '    $ProcessIds = @($Processes | ForEach-Object { $_.Id })',
    '    Write-InstallerLog "stopping existing YTM Tray processes $($ProcessIds -join '', '')"',
    '    $Processes | Stop-Process -Force -ErrorAction SilentlyContinue',
    '    foreach ($ProcessId in $ProcessIds) {',
    '      try {',
    '        Wait-Process -Id $ProcessId -Timeout 30 -ErrorAction SilentlyContinue',
    '      } catch {}',
    '    }',
    '    Start-Sleep -Milliseconds 750',
    '  }',
    '  $InstallerParameters = @{',
    "    RuntimeIdentifier = $(ConvertTo-PowerShellLiteral $RuntimeIdentifier)",
    "    InstallRoot = $(ConvertTo-PowerShellLiteral $InstallRoot)",
    '    InstallerWorker = $true',
    "    InstallerLogPath = $(ConvertTo-PowerShellLiteral $InstallerLogPath)",
    '  }',
    "  `$AdditionalAllowedOrigins = @($AdditionalOriginValues)",
    '  if ($AdditionalAllowedOrigins.Count -gt 0) {',
    '    $InstallerParameters.Add("AdditionalAllowedOrigins", $AdditionalAllowedOrigins)',
    '  }',
    '  & $InstallerScriptPath @InstallerParameters',
    '  if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) {',
    '    throw "installer exited with code $LASTEXITCODE"',
    '  }',
    '  Write-InstallerLog "installer completed"',
    "} catch {",
    '  Write-InstallerLog "installer failed: $($_.Exception.Message)"',
    "  throw",
    "}"
  ) -join "`r`n"

  Set-Content -LiteralPath $CompatibilityRunnerPath -Value $RunnerScript -Encoding utf8

  $RunnerArguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (ConvertTo-ProcessArgument $CompatibilityRunnerPath)
  )
  $Process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $RunnerArguments `
    -WorkingDirectory $ScriptRoot `
    -WindowStyle Hidden `
    -PassThru
  Write-Output "Started YTM Tray installer worker $($Process.Id)"
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
  Copy-ItemWithRetry -LiteralPath $PackagedExecutablePath -Destination $ExecutablePath
  Copy-ItemWithRetry `
    -LiteralPath $PackagedNativeHostExecutablePath `
    -Destination $NativeHostExecutablePath
  if (Test-Path -LiteralPath $PackagedReleaseMetadataPath) {
    Copy-ItemWithRetry -LiteralPath $PackagedReleaseMetadataPath -Destination $ReleaseMetadataPath
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
  Save-FirefoxRegistry64Backup
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
  Restore-FirefoxRegistry64Backup
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

  return "0.1.9"
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

if (
  -not $InstallerWorker -and
  (Test-PackagedBinaries) -and
  (Get-RunningTrayProcesses).Count -gt 0
) {
  Start-DetachedInstallerWorker
  return
}

Save-InstallBackup
Save-RegistryBackup
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

Stop-RunningTrayProcesses

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
  Set-FirefoxRegistry64Value -Value $FirefoxManifestPath

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

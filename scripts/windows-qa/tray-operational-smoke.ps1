param(
  [string] $Version = "",
  [string] $InstallRoot = (Join-Path $env:LOCALAPPDATA "YTM Enhancer\Tray"),
  [string] $WorkRoot = (Join-Path $env:TEMP "ytm-tray-operational-smoke"),
  [int] $UiReadyTimeoutSeconds = 60,
  [string] $PlaybackUrl = $env:YTME_WINDOWS_TRAY_OPERATIONAL_PLAYBACK_URL,
  [switch] $SkipChromeLaunch
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

. "$PSScriptRoot\ui-agent-client.ps1"

$HostName = "com.gormanity.ytm_enhancer.tray"
$ReleaseDownloadRoot = "https://github.com/gormanity/ytm-enhancer/releases/download"
$RuntimeIdentifier = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
  "win-arm64"
} else {
  "win-x64"
}
$UninstallRegistryKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray"
$StartMenuFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\YTM Enhancer"
$ChromiumManifestPath = Join-Path $InstallRoot "$HostName.json"
$FirefoxManifestPath = Join-Path $InstallRoot "$HostName.firefox.json"
$NativeHostPath = Join-Path $InstallRoot "YTMTray.NativeHost.exe"
$ReleaseMetadataPath = Join-Path $InstallRoot "release.json"
$TrayPath = Join-Path $InstallRoot "YTMTray.exe"
$UninstallerPath = Join-Path $InstallRoot "uninstall-native-hosts.ps1"
$LaunchResultPath = Join-Path $WorkRoot "launch.json"
$TrayLogPath = Join-Path $WorkRoot "tray.log"
$NativeRegistryKeys = @{
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" = $ChromiumManifestPath
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName" = $ChromiumManifestPath
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName" = $FirefoxManifestPath
}

function ConvertTo-PowerShellLiteral {
  param([Parameter(Mandatory = $true)][string] $Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)][object] $Expected,
    [Parameter(Mandatory = $true)][object] $Actual,
    [Parameter(Mandatory = $true)][string] $Label
  )

  if ($Expected -ne $Actual) {
    throw "$Label expected '$Expected', got '$Actual'"
  }
}

function Assert-PathExists {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Expected path to exist: $Path"
  }
}

function Remove-QaTree {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Resolve-SmokeVersion {
  if (-not [string]::IsNullOrWhiteSpace($Version)) {
    return $Version
  }

  $MetadataPath = Join-Path (Get-Location) "apps/windows-tray/release/metadata.json"
  Assert-PathExists $MetadataPath
  $Metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($Metadata.version)) {
    throw "Windows tray release metadata does not include a version."
  }

  return [string] $Metadata.version
}

function New-ResultWrapper {
  param(
    [Parameter(Mandatory = $true)][string] $ResultPath,
    [Parameter(Mandatory = $true)][string[]] $BodyLines
  )

  return @(
    '$ErrorActionPreference = "Stop"',
    "`$ResultPath = $(ConvertTo-PowerShellLiteral $ResultPath)",
    "try {"
  ) + $BodyLines + @(
    "} catch {",
    '  $Payload = @{',
    '    ok = $false',
    '    error = $_.Exception.ToString()',
    '    scriptStack = $_.ScriptStackTrace',
    '  }',
    "}",
    '$Json = $Payload | ConvertTo-Json -Depth 8 -Compress',
    '[IO.File]::WriteAllText($ResultPath, $Json)'
  )
}

function Save-ReleaseAsset {
  param(
    [Parameter(Mandatory = $true)][string] $ReleaseVersion,
    [Parameter(Mandatory = $true)][string] $AssetName,
    [Parameter(Mandatory = $true)][string] $DestinationPath
  )

  $AssetUrl = "$ReleaseDownloadRoot/windows-tray-v$ReleaseVersion/$AssetName"
  Write-Host "Downloading $AssetUrl"
  Invoke-WebRequest -UseBasicParsing -Uri $AssetUrl -OutFile $DestinationPath
}

function Expand-ReleasePackage {
  param(
    [Parameter(Mandatory = $true)][string] $ReleaseVersion,
    [Parameter(Mandatory = $true)][string] $ArchivePath
  )

  $ExtractRoot = Join-Path $WorkRoot "extract-$ReleaseVersion"
  Remove-QaTree -Path $ExtractRoot
  New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force

  Assert-PathExists (Join-Path $ExtractRoot "Install YTM Tray.cmd")
  Assert-PathExists (Join-Path $ExtractRoot "Uninstall YTM Tray.cmd")
  Assert-PathExists (Join-Path $ExtractRoot "install-native-hosts.ps1")
  Assert-PathExists (Join-Path $ExtractRoot "uninstall-native-hosts.ps1")
  Assert-PathExists (Join-Path $ExtractRoot "release.json")
  Assert-PathExists (Join-Path $ExtractRoot "YTMTray.exe")
  Assert-PathExists (Join-Path $ExtractRoot "YTMTray.NativeHost.exe")

  return $ExtractRoot
}

function Assert-AuthenticodeSigner {
  param([Parameter(Mandatory = $true)][string] $Path)

  $Signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($Signature.Status -eq "NotSigned" -or $null -eq $Signature.SignerCertificate) {
    throw "Expected Authenticode signer on ${Path}; got $($Signature.Status): $($Signature.StatusMessage)"
  }
  if ($Signature.Status -eq "HashMismatch") {
    throw "Authenticode signature hash mismatch on ${Path}: $($Signature.StatusMessage)"
  }
}

function Assert-InstalledRelease {
  param([Parameter(Mandatory = $true)][string] $ReleaseVersion)

  Assert-PathExists $TrayPath
  Assert-PathExists $NativeHostPath
  Assert-PathExists $ChromiumManifestPath
  Assert-PathExists $FirefoxManifestPath
  Assert-PathExists $UninstallerPath
  Assert-PathExists $ReleaseMetadataPath
  Assert-PathExists $UninstallRegistryKey
  Assert-PathExists (Join-Path $StartMenuFolder "YTM Tray.lnk")
  Assert-PathExists (Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk")

  Assert-AuthenticodeSigner $TrayPath
  Assert-AuthenticodeSigner $NativeHostPath

  $ReleaseMetadata = Get-Content -LiteralPath $ReleaseMetadataPath -Raw |
    ConvertFrom-Json
  Assert-Equal $ReleaseVersion $ReleaseMetadata.version "installed release metadata version"
  Assert-Equal $RuntimeIdentifier $ReleaseMetadata.runtimeIdentifier "installed runtime"

  $UninstallEntry = Get-ItemProperty -LiteralPath $UninstallRegistryKey
  Assert-Equal $InstallRoot $UninstallEntry.InstallLocation "uninstall install location"
  Assert-Equal $ReleaseVersion $UninstallEntry.DisplayVersion "uninstall display version"

  foreach ($RegistryKey in $NativeRegistryKeys.Keys) {
    Assert-PathExists $RegistryKey
    $ManifestPath = (Get-Item -LiteralPath $RegistryKey).GetValue("")
    Assert-Equal $NativeRegistryKeys[$RegistryKey] $ManifestPath "$RegistryKey manifest path"
  }
}

function Invoke-InstalledUninstaller {
  if (Test-Path -LiteralPath $UninstallerPath) {
    & $UninstallerPath -Quiet
  }
}

function Install-ReleasePackage {
  param(
    [Parameter(Mandatory = $true)][string] $ExtractRoot,
    [Parameter(Mandatory = $true)][string] $ReleaseVersion
  )

  Push-Location $ExtractRoot
  try {
    & .\install-native-hosts.ps1 `
      -RuntimeIdentifier $RuntimeIdentifier `
      -InstallRoot $InstallRoot
  } finally {
    Pop-Location
  }

  Assert-InstalledRelease -ReleaseVersion $ReleaseVersion
}

function Start-OperationalDesktopSession {
  param([Parameter(Mandatory = $true)][int] $ExpectedSessionId)

  $ChromeLaunchLines = @()
  if (-not $SkipChromeLaunch) {
    $ChromeLaunchLines = @(
      '$ChromePath = ""',
      '$ChromeAppPath = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" -ErrorAction SilentlyContinue',
      'if ($ChromeAppPath) { $ChromePath = [string] $ChromeAppPath."(default)" }',
      'if ([string]::IsNullOrWhiteSpace($ChromePath) -or -not (Test-Path -LiteralPath $ChromePath)) {',
      '  $ChromeCommand = Get-Command chrome.exe -ErrorAction SilentlyContinue',
      '  if ($ChromeCommand) { $ChromePath = $ChromeCommand.Source }',
      '}',
      'if ([string]::IsNullOrWhiteSpace($ChromePath) -or -not (Test-Path -LiteralPath $ChromePath)) {',
      '  throw "Google Chrome was not found on this Windows QA target."',
      '}',
      "`$PlaybackUrl = $(ConvertTo-PowerShellLiteral $PlaybackUrl)",
      '$ChromeProcess = Start-Process -FilePath $ChromePath -ArgumentList @($PlaybackUrl) -PassThru',
      'Start-Sleep -Milliseconds 1000',
      '$ChromeProcessId = $ChromeProcess.Id'
    )
  } else {
    $ChromeLaunchLines = @(
      '$ChromePath = ""',
      '$ChromeProcessId = $null'
    )
  }

  $LaunchBodyLines = @(
    "`$TrayPath = $(ConvertTo-PowerShellLiteral $TrayPath)",
    "`$TrayLogPath = $(ConvertTo-PowerShellLiteral $TrayLogPath)",
    '$env:YTM_TRAY_LOG_PATH = $TrayLogPath',
    '$TrayProcess = Start-Process -FilePath $TrayPath -PassThru',
    'Start-Sleep -Milliseconds 1500',
    '$StartedTrayProcess = Get-Process -Id $TrayProcess.Id -ErrorAction Stop',
    '$ChromePath = ""',
    '$ChromeProcessId = $null'
  )
  $LaunchBodyLines += $ChromeLaunchLines
  $LaunchBodyLines += @(
    '$Payload = @{',
    '  ok = $true',
    '  trayPid = $StartedTrayProcess.Id',
    '  traySessionId = $StartedTrayProcess.SessionId',
    '  chromePath = $ChromePath',
    '  chromePid = $ChromeProcessId',
    '}'
  )

  $LaunchLines = New-ResultWrapper `
    -ResultPath $LaunchResultPath `
    -BodyLines $LaunchBodyLines

  $Launch = Invoke-InteractivePowerShell `
    -Name "operational-launch" `
    -ScriptLines $LaunchLines `
    -ResultPath $LaunchResultPath `
    -TimeoutSeconds 60
  Assert-Equal $ExpectedSessionId $Launch.traySessionId "tray process session"
  return $Launch
}

$ResolvedVersion = Resolve-SmokeVersion
if ([string]::IsNullOrWhiteSpace($PlaybackUrl)) {
  $PlaybackUrl = "https://music.youtube.com/"
}

Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force

Remove-QaTree -Path $WorkRoot
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

$AgentProbe = Wait-WindowsQaUiAgentReady `
  -TimeoutSeconds $UiReadyTimeoutSeconds `
  -ProbeTimeoutSeconds 10
$ActiveSessionId = $AgentProbe.sessionId
Write-Host "Using Windows QA UI agent desktop session $ActiveSessionId."

Invoke-InstalledUninstaller
if (Test-Path -LiteralPath $InstallRoot) {
  Remove-QaTree -Path $InstallRoot
}

$ArchiveName = "YTM-Tray-$ResolvedVersion-$RuntimeIdentifier.zip"
$ArchivePath = Join-Path $WorkRoot $ArchiveName
Save-ReleaseAsset `
  -ReleaseVersion $ResolvedVersion `
  -AssetName $ArchiveName `
  -DestinationPath $ArchivePath
$ExtractRoot = Expand-ReleasePackage `
  -ReleaseVersion $ResolvedVersion `
  -ArchivePath $ArchivePath

Write-Host "Installing YTM Tray $ResolvedVersion from published release."
Install-ReleasePackage -ExtractRoot $ExtractRoot -ReleaseVersion $ResolvedVersion

Write-Host "Launching YTM Tray $ResolvedVersion in desktop session $ActiveSessionId."
$Launch = Start-OperationalDesktopSession -ExpectedSessionId $ActiveSessionId

Write-Host "Windows tray operational smoke passed: $ResolvedVersion ($RuntimeIdentifier)."
Write-Host "YTM Tray pid: $($Launch.trayPid)"
if (-not $SkipChromeLaunch) {
  Write-Host "Opened Google Chrome to $PlaybackUrl"
}
Write-Host "Left YTM Tray installed at $InstallRoot for manual testing."
Write-Host "Operational smoke artifacts: $WorkRoot"

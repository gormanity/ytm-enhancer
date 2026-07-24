param(
  [string] $BaselineVersion = "0.0.2",
  [string] $TargetVersion = "0.1.0",
  [string] $InstallRoot = (Join-Path $env:TEMP "ytm-tray-release-e2e-install"),
  [string] $WorkRoot = (Join-Path $env:TEMP "ytm-tray-release-e2e"),
  [switch] $KeepArtifacts
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

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
$SetupPath = Join-Path $InstallRoot "YTMTray.Setup.exe"
$LegacyUninstallerPath = Join-Path $InstallRoot "uninstall-native-hosts.ps1"
$TrayShortcutPath = Join-Path $StartMenuFolder "YTM Tray.lnk"
$UninstallShortcutPath = Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk"
$NativeRegistryKeys = @{
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" = $ChromiumManifestPath
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName" = $ChromiumManifestPath
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName" = $FirefoxManifestPath
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

function Assert-PathMissing {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (Test-Path -LiteralPath $Path) {
    throw "Expected path to be removed: $Path"
  }
}

function Assert-NoInstalledScripts {
  $Scripts = @(
    Get-ChildItem -LiteralPath $InstallRoot -Recurse -File |
      Where-Object { $_.Extension -in @(".cmd", ".ps1") }
  )
  if ($Scripts.Count -gt 0) {
    throw "Expected no installed command or PowerShell scripts; found: $($Scripts.FullName -join ', ')"
  }
}

function Assert-Shortcut {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $ExpectedTargetPath,
    [string] $ExpectedArguments = ""
  )

  Assert-PathExists $Path
  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($Path)
  Assert-Equal $ExpectedTargetPath $Shortcut.TargetPath "$Path target"
  Assert-Equal $ExpectedArguments $Shortcut.Arguments "$Path arguments"
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string] $FilePath,
    [string[]] $Arguments = @()
  )

  if ([IO.Path]::GetFileName($FilePath) -ieq "YTMTray.Setup.exe") {
    $CommandLine = @(
      $Arguments | ForEach-Object {
        if ($_ -notmatch '[\s"]' -and $_.Length -gt 0) {
          $_
        } else {
          '"' + (($_ -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
        }
      }
    ) -join " "
    $Process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $CommandLine `
      -Wait `
      -PassThru
    if ($Process.ExitCode -ne 0) {
      throw "$FilePath exited with code $($Process.ExitCode)"
    }
    return
  }

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

function Remove-QaTree {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Get-ReleaseAssetUrl {
  param(
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $AssetName
  )

  return "$ReleaseDownloadRoot/windows-tray-v$Version/$AssetName"
}

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string] $Path)

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Save-ReleaseAsset {
  param(
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $AssetName,
    [Parameter(Mandatory = $true)][string] $DestinationPath
  )

  $AssetUrl = Get-ReleaseAssetUrl -Version $Version -AssetName $AssetName
  Write-Host "Downloading $AssetUrl"
  Invoke-WebRequest -UseBasicParsing -Uri $AssetUrl -OutFile $DestinationPath
}

function Expand-ReleasePackage {
  param(
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $ArchivePath,
    [switch] $RequireNativeSetup
  )

  $ExtractRoot = Join-Path $WorkRoot "extract-$Version"
  Remove-QaTree -Path $ExtractRoot
  New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force

  Assert-PathExists (Join-Path $ExtractRoot "release.json")
  Assert-PathExists (Join-Path $ExtractRoot "YTMTray.exe")
  Assert-PathExists (Join-Path $ExtractRoot "YTMTray.NativeHost.exe")

  $PackageSetupPath = Join-Path $ExtractRoot "YTMTray.Setup.exe"
  if ($RequireNativeSetup) {
    Assert-PathExists $PackageSetupPath
  } elseif (-not (Test-Path -LiteralPath $PackageSetupPath)) {
    Assert-PathExists (Join-Path $ExtractRoot "install-native-hosts.ps1")
    Assert-PathExists (Join-Path $ExtractRoot "uninstall-native-hosts.ps1")
  }

  return $ExtractRoot
}

function Install-ReleasePackage {
  param(
    [Parameter(Mandatory = $true)][string] $ExtractRoot,
    [Parameter(Mandatory = $true)][string] $Version
  )

  $PackageSetupPath = Join-Path $ExtractRoot "YTMTray.Setup.exe"
  $UsesNativeSetup = Test-Path -LiteralPath $PackageSetupPath
  if ($UsesNativeSetup) {
    Invoke-Native `
      -FilePath $PackageSetupPath `
      -Arguments @(
        "install",
        "--quiet",
        "--runtime-identifier",
        $RuntimeIdentifier,
        "--install-root",
        $InstallRoot
      )
  } else {
    & (Join-Path $ExtractRoot "install-native-hosts.ps1") `
      -RuntimeIdentifier $RuntimeIdentifier `
      -InstallRoot $InstallRoot
  }

  Assert-InstalledRelease `
    -Version $Version `
    -NativeSetupExpected:$UsesNativeSetup
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
  param(
    [Parameter(Mandatory = $true)][string] $Version,
    [switch] $NativeSetupExpected
  )

  $TrayPath = Join-Path $InstallRoot "YTMTray.exe"
  $ReleaseMetadataPath = Join-Path $InstallRoot "release.json"

  Assert-PathExists $TrayPath
  Assert-PathExists $NativeHostPath
  Assert-PathExists $ChromiumManifestPath
  Assert-PathExists $FirefoxManifestPath
  Assert-PathExists $ReleaseMetadataPath
  Assert-PathExists $UninstallRegistryKey
  Assert-PathExists $TrayShortcutPath
  Assert-PathExists $UninstallShortcutPath

  Assert-AuthenticodeSigner $TrayPath
  Assert-AuthenticodeSigner $NativeHostPath
  if ($NativeSetupExpected) {
    Assert-PathExists $SetupPath
    Assert-AuthenticodeSigner $SetupPath
    Assert-PathMissing $LegacyUninstallerPath
    Assert-NoInstalledScripts
  } else {
    Assert-PathExists $LegacyUninstallerPath
  }

  $ReleaseMetadata = Get-Content -LiteralPath $ReleaseMetadataPath -Raw |
    ConvertFrom-Json
  Assert-Equal $Version $ReleaseMetadata.version "installed release metadata version"
  Assert-Equal $RuntimeIdentifier $ReleaseMetadata.runtimeIdentifier "installed runtime"

  $UninstallEntry = Get-ItemProperty -LiteralPath $UninstallRegistryKey
  Assert-Equal $InstallRoot $UninstallEntry.InstallLocation "uninstall install location"
  Assert-Equal $Version $UninstallEntry.DisplayVersion "uninstall display version"
  if ($NativeSetupExpected) {
    Assert-Equal `
      "`"$SetupPath`" uninstall" `
      $UninstallEntry.UninstallString `
      "uninstall command"
    Assert-Equal `
      "`"$SetupPath`" uninstall --quiet" `
      $UninstallEntry.QuietUninstallString `
      "quiet uninstall command"
    Assert-Shortcut `
      -Path $TrayShortcutPath `
      -ExpectedTargetPath $TrayPath
    Assert-Shortcut `
      -Path $UninstallShortcutPath `
      -ExpectedTargetPath $SetupPath `
      -ExpectedArguments "uninstall"
  }

  foreach ($RegistryKey in $NativeRegistryKeys.Keys) {
    Assert-PathExists $RegistryKey
    $ManifestPath = (Get-Item -LiteralPath $RegistryKey).GetValue("")
    Assert-Equal $NativeRegistryKeys[$RegistryKey] $ManifestPath "$RegistryKey manifest path"
  }

  $ChromiumManifest = Get-Content -LiteralPath $ChromiumManifestPath -Raw |
    ConvertFrom-Json
  Assert-Equal $HostName $ChromiumManifest.name "Chromium native host name"
  Assert-Equal $NativeHostPath $ChromiumManifest.path "Chromium native host path"

  $FirefoxManifest = Get-Content -LiteralPath $FirefoxManifestPath -Raw |
    ConvertFrom-Json
  Assert-Equal $HostName $FirefoxManifest.name "Firefox native host name"
  Assert-Equal $NativeHostPath $FirefoxManifest.path "Firefox native host path"
}

function Assert-Uninstalled {
  Assert-PathMissing $InstallRoot
  Assert-PathMissing $UninstallRegistryKey
  Assert-PathMissing $TrayShortcutPath
  Assert-PathMissing $UninstallShortcutPath

  foreach ($RegistryKey in $NativeRegistryKeys.Keys) {
    Assert-PathMissing $RegistryKey
  }
}

function Get-VerifiedUpdatePackage {
  param([Parameter(Mandatory = $true)][string] $Version)

  $ManifestPath = Join-Path $WorkRoot "YTM-Tray-update-$Version.json"
  Save-ReleaseAsset `
    -Version $Version `
    -AssetName "YTM-Tray-update.json" `
    -DestinationPath $ManifestPath

  $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  Assert-Equal 1 $Manifest.schemaVersion "update manifest schema"
  Assert-Equal "windows-tray" $Manifest.product "update manifest product"
  Assert-Equal $Version $Manifest.version "update manifest version"
  Assert-Equal "windows-tray-v$Version" $Manifest.tag "update manifest tag"

  $Asset = $Manifest.assets.PSObject.Properties[$RuntimeIdentifier].Value
  if ($null -eq $Asset) {
    throw "No update asset for $RuntimeIdentifier in $ManifestPath"
  }

  $ArchivePath = Join-Path $WorkRoot $Asset.name
  Write-Host "Downloading $($Asset.url)"
  Invoke-WebRequest -UseBasicParsing -Uri $Asset.url -OutFile $ArchivePath

  $ActualSha256 = Get-FileSha256 -Path $ArchivePath
  Assert-Equal $Asset.sha256 $ActualSha256 "update package sha256"

  return Expand-ReleasePackage `
    -Version $Version `
    -ArchivePath $ArchivePath `
    -RequireNativeSetup
}

function Invoke-InstalledUninstaller {
  if (Test-Path -LiteralPath $SetupPath) {
    Invoke-Native `
      -FilePath $SetupPath `
      -Arguments @(
        "uninstall",
        "--quiet",
        "--install-root",
        $InstallRoot
      )
    Wait-Uninstalled
    return
  }

  if (Test-Path -LiteralPath $LegacyUninstallerPath) {
    & $LegacyUninstallerPath -InstallRoot $InstallRoot
  }
}

function Wait-Uninstalled {
  param([int] $TimeoutSeconds = 30)

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while (
    (
      (Test-Path -LiteralPath $InstallRoot) -or
      (Test-Path -LiteralPath $UninstallRegistryKey) -or
      (Test-Path -LiteralPath $TrayShortcutPath) -or
      (Test-Path -LiteralPath $UninstallShortcutPath)
    ) -and
    (Get-Date) -lt $Deadline
  ) {
    Start-Sleep -Milliseconds 250
  }
  Assert-Uninstalled
}

Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force

Remove-QaTree -Path $WorkRoot
Remove-QaTree -Path $InstallRoot
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

try {
  $BaselineArchiveName = "YTM-Tray-$BaselineVersion-$RuntimeIdentifier.zip"
  $BaselineArchivePath = Join-Path $WorkRoot $BaselineArchiveName
  Save-ReleaseAsset `
    -Version $BaselineVersion `
    -AssetName $BaselineArchiveName `
    -DestinationPath $BaselineArchivePath
  $BaselineExtractRoot = Expand-ReleasePackage `
    -Version $BaselineVersion `
    -ArchivePath $BaselineArchivePath

  Write-Host "Installing YTM Tray $BaselineVersion from published release."
  Install-ReleasePackage -ExtractRoot $BaselineExtractRoot -Version $BaselineVersion

  Write-Host "Updating YTM Tray $BaselineVersion to $TargetVersion from published manifest."
  $TargetExtractRoot = Get-VerifiedUpdatePackage -Version $TargetVersion
  Install-ReleasePackage -ExtractRoot $TargetExtractRoot -Version $TargetVersion

  Write-Host "Uninstalling YTM Tray $TargetVersion from installed uninstaller."
  Invoke-InstalledUninstaller
  Assert-Uninstalled

  Write-Host "Windows tray release E2E passed: $BaselineVersion -> $TargetVersion ($RuntimeIdentifier)."
} finally {
  Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
    Stop-Process -Force

  if (Test-Path -LiteralPath $InstallRoot) {
    Invoke-InstalledUninstaller
  }

  if (-not $KeepArtifacts) {
    Remove-QaTree -Path $WorkRoot
  }
}

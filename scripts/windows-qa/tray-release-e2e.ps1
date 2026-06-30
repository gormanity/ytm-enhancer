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
    [Parameter(Mandatory = $true)][string] $ArchivePath
  )

  $ExtractRoot = Join-Path $WorkRoot "extract-$Version"
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

function Install-ReleasePackage {
  param(
    [Parameter(Mandatory = $true)][string] $ExtractRoot,
    [Parameter(Mandatory = $true)][string] $Version
  )

  Push-Location $ExtractRoot
  try {
    & .\install-native-hosts.ps1 `
      -RuntimeIdentifier $RuntimeIdentifier `
      -InstallRoot $InstallRoot
  } finally {
    Pop-Location
  }

  Assert-InstalledRelease -Version $Version
}

function Assert-AuthenticodeSigner {
  param([Parameter(Mandatory = $true)][string] $Path)

  $Signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($null -eq $Signature.SignerCertificate) {
    throw "Expected Authenticode signer on $Path"
  }
  if ($Signature.SignerCertificate.Subject -notlike "*YTM Tray Beta Self-Signed*") {
    throw "Unexpected signer for ${Path}: $($Signature.SignerCertificate.Subject)"
  }
}

function Assert-InstalledRelease {
  param([Parameter(Mandatory = $true)][string] $Version)

  $TrayPath = Join-Path $InstallRoot "YTMTray.exe"
  $ReleaseMetadataPath = Join-Path $InstallRoot "release.json"

  Assert-PathExists $TrayPath
  Assert-PathExists $NativeHostPath
  Assert-PathExists $ChromiumManifestPath
  Assert-PathExists $FirefoxManifestPath
  Assert-PathExists (Join-Path $InstallRoot "uninstall-native-hosts.ps1")
  Assert-PathExists (Join-Path $InstallRoot "Uninstall YTM Tray.cmd")
  Assert-PathExists $ReleaseMetadataPath
  Assert-PathExists $UninstallRegistryKey
  Assert-PathExists (Join-Path $StartMenuFolder "YTM Tray.lnk")
  Assert-PathExists (Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk")

  Assert-AuthenticodeSigner $TrayPath
  Assert-AuthenticodeSigner $NativeHostPath

  $ReleaseMetadata = Get-Content -LiteralPath $ReleaseMetadataPath -Raw |
    ConvertFrom-Json
  Assert-Equal $Version $ReleaseMetadata.version "installed release metadata version"
  Assert-Equal $RuntimeIdentifier $ReleaseMetadata.runtimeIdentifier "installed runtime"

  $UninstallEntry = Get-ItemProperty -LiteralPath $UninstallRegistryKey
  Assert-Equal $InstallRoot $UninstallEntry.InstallLocation "uninstall install location"
  Assert-Equal $Version $UninstallEntry.DisplayVersion "uninstall display version"

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
  Assert-PathMissing (Join-Path $StartMenuFolder "YTM Tray.lnk")
  Assert-PathMissing (Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk")

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

  return Expand-ReleasePackage -Version $Version -ArchivePath $ArchivePath
}

function Invoke-InstalledUninstaller {
  $UninstallerPath = Join-Path $InstallRoot "uninstall-native-hosts.ps1"
  Assert-PathExists $UninstallerPath
  & $UninstallerPath -InstallRoot $InstallRoot
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
    $FallbackUninstaller = Join-Path $InstallRoot "uninstall-native-hosts.ps1"
    if (Test-Path -LiteralPath $FallbackUninstaller) {
      & $FallbackUninstaller -InstallRoot $InstallRoot
    }
  }

  if (-not $KeepArtifacts) {
    Remove-QaTree -Path $WorkRoot
  }
}

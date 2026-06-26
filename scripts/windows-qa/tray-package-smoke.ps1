$ErrorActionPreference = "Stop"

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

function Assert-PathExists {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Expected path to exist: $Path"
  }
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

function Assert-Throws {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock] $Script,
    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  try {
    & $Script
  } catch {
    return
  }

  throw "Expected failure: $Label"
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw ".NET 10 SDK is required for Windows tray package QA."
}

$RepositoryRoot = (Get-Location).Path
$Metadata = Get-Content -LiteralPath "apps/windows-tray/release/metadata.json" -Raw |
  ConvertFrom-Json
$RuntimeIdentifier = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
  "win-arm64"
} else {
  "win-x64"
}
$PackageScript = "windows-tray:package:$RuntimeIdentifier"
$ArchivePath = "apps/windows-tray/.build/packages/YTM-Tray-$($Metadata.version)-$RuntimeIdentifier.zip"
$UpdateManifestPath = "apps/windows-tray/.build/update-manifest/YTM-Tray-update.json"
$ExtractRoot = Join-Path $env:TEMP "ytm-tray-package-smoke"
$InstallRoot = Join-Path $env:TEMP "ytm-tray-package-install"

$env:CI = "true"

Invoke-Native pnpm run $PackageScript
Invoke-Native pnpm run windows-tray:update-manifest -- "--package=$ArchivePath"

Assert-PathExists $ArchivePath
Assert-PathExists $UpdateManifestPath

$UpdateManifest = Get-Content -LiteralPath $UpdateManifestPath -Raw |
  ConvertFrom-Json
$RuntimeAsset = $UpdateManifest.assets.PSObject.Properties[$RuntimeIdentifier].Value
Assert-Equal "windows-tray-v$($Metadata.version)" $UpdateManifest.tag "update manifest tag"
Assert-Equal "YTM-Tray-$($Metadata.version)-$RuntimeIdentifier.zip" $RuntimeAsset.name "update manifest asset"
if ($RuntimeAsset.sha256 -notmatch "^[a-f0-9]{64}$") {
  throw "Update manifest sha256 is invalid: $($RuntimeAsset.sha256)"
}

if (Test-Path -LiteralPath $ExtractRoot) {
  Remove-Item -LiteralPath $ExtractRoot -Recurse -Force
}
if (Test-Path -LiteralPath $InstallRoot) {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null

try {
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force

  Push-Location $ExtractRoot
  & .\install-native-hosts.ps1 -InstallRoot $InstallRoot
  Pop-Location

  Assert-PathExists (Join-Path $InstallRoot "YTMTray.exe")
  Assert-PathExists (Join-Path $InstallRoot "YTMTray.NativeHost.exe")
  Assert-PathExists (Join-Path $InstallRoot "com.gormanity.ytm_enhancer.tray.json")
  Assert-PathExists (Join-Path $InstallRoot "com.gormanity.ytm_enhancer.tray.firefox.json")
  Assert-PathExists (Join-Path $InstallRoot "release.json")
  Assert-PathExists (Join-Path $ExtractRoot "release.json")

  $PackageMetadata = Get-Content -LiteralPath (Join-Path $ExtractRoot "release.json") -Raw |
    ConvertFrom-Json
  Assert-Equal $RuntimeIdentifier $PackageMetadata.runtimeIdentifier "package runtime"
  Assert-Equal $Metadata.version $PackageMetadata.version "package version"
  Assert-Equal $Metadata.githubReleaseListUrl $PackageMetadata.releaseListUrl "package release list URL"
  Assert-Equal "YTM-Tray-update.json" $PackageMetadata.updateManifestAssetName "package update manifest asset"

  $ExistingTrayBytes = Get-Content -LiteralPath (Join-Path $InstallRoot "YTMTray.exe") -Encoding Byte -TotalCount 16
  Set-Content -LiteralPath (Join-Path $ExtractRoot "YTMTray.exe") -Value "broken update payload"
  Push-Location $ExtractRoot
  Assert-Throws {
    & .\install-native-hosts.ps1 -InstallRoot $InstallRoot `
      -AdditionalAllowedOrigins "not-a-valid-origin"
  } "invalid package reinstall"
  Pop-Location
  Assert-PathExists (Join-Path $InstallRoot "YTMTray.exe")
  Assert-PathExists (Join-Path $InstallRoot "YTMTray.NativeHost.exe")
  $RestoredTrayBytes = Get-Content -LiteralPath (Join-Path $InstallRoot "YTMTray.exe") -Encoding Byte -TotalCount 16
  Assert-Equal ($ExistingTrayBytes -join ",") ($RestoredTrayBytes -join ",") "restored tray executable"
} finally {
  if ((Get-Location).Path -eq $ExtractRoot) {
    Pop-Location
  }

  & (Join-Path $RepositoryRoot "apps/windows-tray/scripts/uninstall-native-hosts.ps1") `
    -InstallRoot $InstallRoot

  if (Test-Path -LiteralPath $ExtractRoot) {
    Remove-Item -LiteralPath $ExtractRoot -Recurse -Force
  }
}

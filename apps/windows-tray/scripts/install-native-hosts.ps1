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
$ManifestPath = Join-Path $InstallRoot "$HostName.json"
$DefaultAllowedOrigins = @(
  "chrome-extension://pggblbpjleekkobiinobaeeefnimgljh/",
  "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/",
  "chrome-extension://bilcedjabgiedoamakekncokccabdccp/",
  "chrome-extension://gamefnibdabclmkngggcjghpbhjmajkm/"
)
$RegistryKeys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
)

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
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-PackagedBinaries) {
  Install-PackagedBinaries
} else {
  Publish-FromSource
}

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

$Manifest |
  ConvertTo-Json -Depth 5 |
  Set-Content -LiteralPath $ManifestPath -Encoding utf8

foreach ($RegistryKey in $RegistryKeys) {
  New-Item -Path $RegistryKey -Force | Out-Null
  Set-Item -Path $RegistryKey -Value $ManifestPath
  Write-Output "Installed $RegistryKey -> $ManifestPath"
}

Write-Output "Installed $ExecutablePath"
Write-Output "Installed $NativeHostExecutablePath"
Write-Output "Open YTM Tray, then enable Connected Apps in YTM Enhancer."

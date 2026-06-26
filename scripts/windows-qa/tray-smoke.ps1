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

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw ".NET 10 SDK is required for Windows tray QA."
}

$SdkMajorVersions = dotnet --list-sdks |
  ForEach-Object { ($_ -split "\.")[0] } |
  Where-Object { $_ -match "^\d+$" } |
  ForEach-Object { [int] $_ }

if (-not ($SdkMajorVersions | Where-Object { $_ -ge 10 })) {
  throw ".NET 10 SDK or newer is required for Windows tray QA."
}

$RuntimeMajorVersions = dotnet --list-runtimes |
  ForEach-Object {
    if ($_ -match "^Microsoft\.NETCore\.App\s+(\d+)\.") {
      [int] $Matches[1]
    }
  }

if (-not ($RuntimeMajorVersions | Where-Object { $_ -eq 10 })) {
  throw ".NET 10 runtime is required for Windows tray QA because the tray tests target net10.0."
}

$HostName = "com.gormanity.ytm_enhancer.tray"
$RuntimeIdentifier = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
  "win-arm64"
} else {
  "win-x64"
}
$InstallRoot = Join-Path $env:TEMP "ytm-enhancer-tray-smoke"
$ManifestPath = Join-Path $InstallRoot "$HostName.json"
$FirefoxManifestPath = Join-Path $InstallRoot "$HostName.firefox.json"
$ExecutablePath = Join-Path $InstallRoot "YTMTray.exe"
$NativeHostExecutablePath = Join-Path $InstallRoot "YTMTray.NativeHost.exe"
$RegistryKeys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
)
$FirefoxRegistryKeys = @(
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
)

$env:CI = "true"

Invoke-Native dotnet run --project apps/windows-tray/tests/YTMTray.Tests/YTMTray.Tests.csproj

try {
  & .\apps\windows-tray\scripts\install-native-hosts.ps1 `
    -RuntimeIdentifier $RuntimeIdentifier `
    -InstallRoot $InstallRoot

  Assert-PathExists $ExecutablePath
  Assert-PathExists $NativeHostExecutablePath
  Assert-PathExists $ManifestPath
  Assert-PathExists $FirefoxManifestPath

  $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  Assert-Equal $HostName $Manifest.name "manifest name"
  Assert-Equal $NativeHostExecutablePath $Manifest.path "manifest path"
  Assert-Equal "stdio" $Manifest.type "manifest type"
  Assert-Equal $true ($Manifest.allowed_origins -contains "chrome-extension://bilcedjabgiedoamakekncokccabdccp/") "chromium manifest store origin"

  $FirefoxManifest = Get-Content -LiteralPath $FirefoxManifestPath -Raw | ConvertFrom-Json
  Assert-Equal $HostName $FirefoxManifest.name "firefox manifest name"
  Assert-Equal $NativeHostExecutablePath $FirefoxManifest.path "firefox manifest path"
  Assert-Equal "stdio" $FirefoxManifest.type "firefox manifest type"
  Assert-Equal $true ($FirefoxManifest.allowed_extensions -contains "ytm-enhancer@gormanity") "firefox manifest extension"

  foreach ($RegistryKey in $RegistryKeys) {
    Assert-PathExists $RegistryKey
    $Value = (Get-Item -LiteralPath $RegistryKey).GetValue("")
    Assert-Equal $ManifestPath $Value "$RegistryKey default value"
  }

  foreach ($RegistryKey in $FirefoxRegistryKeys) {
    Assert-PathExists $RegistryKey
    $Value = (Get-Item -LiteralPath $RegistryKey).GetValue("")
    Assert-Equal $FirefoxManifestPath $Value "$RegistryKey default value"
  }
} finally {
  & .\apps\windows-tray\scripts\uninstall-native-hosts.ps1 `
    -InstallRoot $InstallRoot
}

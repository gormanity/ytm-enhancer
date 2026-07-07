param(
  [string] $ExpectedOwner = $(if ($env:YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL) {
      $env:YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL
    } else {
      "Microsoft Edge (dev)"
    })
)

$ErrorActionPreference = "Stop"

$HostName = "com.gormanity.ytm_enhancer.tray"
$ActiveBrowserPath = Join-Path $env:LOCALAPPDATA "YTM Enhancer\Tray\active-browser.json"

function Get-SourceDisplayName {
  param([Parameter(Mandatory = $true)] $Source)

  if ($Source.displayName) {
    return [string] $Source.displayName
  }

  if (-not $Source.name) {
    return $null
  }

  if ($Source.isDevBuild) {
    return "$($Source.name) (dev)"
  }

  return [string] $Source.name
}

function Assert-ActiveBrowserOwner {
  param([Parameter(Mandatory = $true)][string] $ExpectedOwner)

  if (-not (Test-Path -LiteralPath $ActiveBrowserPath)) {
    throw "YTM Tray is not connected to a browser. Expected active browser file: $ActiveBrowserPath"
  }

  $Connection = Get-Content -LiteralPath $ActiveBrowserPath -Raw | ConvertFrom-Json
  $DisplayName = if ($Connection.source) {
    Get-SourceDisplayName $Connection.source
  } else {
    $null
  }

  if ($DisplayName -ne $ExpectedOwner) {
    throw "YTM Tray active browser is '$DisplayName', expected '$ExpectedOwner'. Connect the expected browser before running this smoke."
  }

  $Process = Get-Process -Id $Connection.processId -ErrorAction SilentlyContinue
  if (-not $Process) {
    throw "YTM Tray active browser process $($Connection.processId) is not running."
  }
}

function Assert-FirefoxNativeHostRegistered {
  $RegistryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
  if (-not (Test-Path -LiteralPath $RegistryPath)) {
    throw "Firefox native messaging host is not registered at $RegistryPath. Install YTM Tray before running this smoke."
  }
}

$env:CI = "true"
$env:YTME_E2E_WINDOWS_TRAY_CONTENTION = "1"
$env:YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL = $ExpectedOwner

. "$PSScriptRoot\ensure-pnpm.ps1"
Ensure-Pnpm
Assert-ActiveBrowserOwner -ExpectedOwner $ExpectedOwner
Assert-FirefoxNativeHostRegistered
Invoke-Pnpm install --frozen-lockfile
Invoke-Pnpm exec playwright install firefox
Invoke-Pnpm run dev:build:firefox
Assert-ActiveBrowserOwner -ExpectedOwner $ExpectedOwner
Invoke-Pnpm exec playwright test tests/e2e/windows-tray-contention.spec.ts --project=firefox --workers=1

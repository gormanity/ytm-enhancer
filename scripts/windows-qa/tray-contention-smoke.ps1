param(
  [string] $ExpectedOwner = $(if ($env:YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL) {
      $env:YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL
    } else {
      "Microsoft Edge (dev)"
    }),
  [switch] $PreflightOnly
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

function ConvertTo-PreflightJson {
  param([Parameter(Mandatory = $true)] $Summary)

  return $Summary | ConvertTo-Json -Depth 6 -Compress
}

function Write-StatusLine {
  param([Parameter(Mandatory = $true)][string] $Message)

  [Console]::Out.WriteLine($Message)
}

function Get-ActiveBrowserSummary {
  $Summary = [ordered]@{
    activeBrowserPath = $ActiveBrowserPath
    connectedAt = $null
    exists = $false
    processId = $null
    processRunning = $false
    readError = $null
    sourceDisplayName = $null
    sourceExtensionId = $null
    sourceIsDevBuild = $null
    sourceName = $null
  }

  if (-not (Test-Path -LiteralPath $ActiveBrowserPath)) {
    return [pscustomobject] $Summary
  }

  $Summary.exists = $true
  try {
    $Connection = Get-Content -LiteralPath $ActiveBrowserPath -Raw |
      ConvertFrom-Json
  } catch {
    $Summary.readError = $_.Exception.Message
    return [pscustomobject] $Summary
  }

  $Summary.connectedAt = $Connection.connectedAt
  $Summary.processId = $Connection.processId
  if ($Connection.source) {
    $Summary.sourceDisplayName = Get-SourceDisplayName $Connection.source
    $Summary.sourceExtensionId = $Connection.source.extensionId
    $Summary.sourceIsDevBuild = $Connection.source.isDevBuild
    $Summary.sourceName = $Connection.source.name
  }

  if ($Connection.processId) {
    $Process = Get-Process -Id $Connection.processId -ErrorAction SilentlyContinue
    $Summary.processRunning = $null -ne $Process
  }

  return [pscustomobject] $Summary
}

function Write-PreflightSummary {
  param(
    [Parameter(Mandatory = $true)] $Summary,
    [Parameter(Mandatory = $true)][string] $ExpectedOwner
  )

  $ActiveOwner = if ([string]::IsNullOrWhiteSpace($Summary.sourceDisplayName)) {
    "<none>"
  } else {
    $Summary.sourceDisplayName
  }

  Write-StatusLine (
    "YTM Tray contention preflight: expectedOwner='{0}'; activeOwner='{1}'; processId='{2}'; processRunning='{3}'; activeBrowserPath='{4}'" -f
      $ExpectedOwner,
      $ActiveOwner,
      $Summary.processId,
      $Summary.processRunning,
      $Summary.activeBrowserPath
  )
}

function Assert-RepoRoot {
  $RepoRoot = (Get-Location).Path
  $RequiredPaths = @(
    "package.json",
    "scripts\windows-qa\ensure-pnpm.ps1",
    "tests\e2e\windows-tray-contention.spec.ts"
  )

  foreach ($RelativePath in $RequiredPaths) {
    $Path = Join-Path $RepoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $Path)) {
      throw "Run this smoke from the ytm-enhancer repository root. Missing required path: $RelativePath"
    }
  }
}

function Assert-ActiveBrowserOwner {
  param([Parameter(Mandatory = $true)][string] $ExpectedOwner)

  $Summary = Get-ActiveBrowserSummary
  Write-PreflightSummary -Summary $Summary -ExpectedOwner $ExpectedOwner

  if (-not $Summary.exists) {
    throw "YTM Tray is not connected to a browser. Preflight summary: $(ConvertTo-PreflightJson $Summary)"
  }

  if ($Summary.readError) {
    throw "Could not read YTM Tray active browser file. Preflight summary: $(ConvertTo-PreflightJson $Summary)"
  }

  if ($Summary.sourceDisplayName -ne $ExpectedOwner) {
    throw "YTM Tray active browser owner mismatch. Expected '$ExpectedOwner'. Preflight summary: $(ConvertTo-PreflightJson $Summary)"
  }

  if (-not $Summary.processRunning) {
    throw "YTM Tray active browser process is not running. Preflight summary: $(ConvertTo-PreflightJson $Summary)"
  }

  return $Summary
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

Assert-RepoRoot
. "$PSScriptRoot\ensure-pnpm.ps1"
Ensure-Pnpm
Assert-ActiveBrowserOwner -ExpectedOwner $ExpectedOwner
Assert-FirefoxNativeHostRegistered

if ($PreflightOnly) {
  Write-StatusLine "YTM Tray contention preflight passed."
  exit 0
}

Invoke-Pnpm install --frozen-lockfile
Invoke-Pnpm exec playwright install firefox
Invoke-Pnpm run dev:build:firefox
Assert-ActiveBrowserOwner -ExpectedOwner $ExpectedOwner
Invoke-Pnpm exec playwright test tests/e2e/windows-tray-contention.spec.ts --project=firefox --workers=1

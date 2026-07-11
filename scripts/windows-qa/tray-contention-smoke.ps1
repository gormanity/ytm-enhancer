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

function Read-ProcessLogs {
  param(
    [Parameter(Mandatory = $true)][string] $StandardOutputPath,
    [Parameter(Mandatory = $true)][string] $StandardErrorPath
  )

  return @(
    if (Test-Path -LiteralPath $StandardOutputPath) {
      Get-Content -LiteralPath $StandardOutputPath -Raw
    }
    if (Test-Path -LiteralPath $StandardErrorPath) {
      Get-Content -LiteralPath $StandardErrorPath -Raw
    }
  ) -join "`n"
}

function Wait-ActiveBrowserOwner {
  param(
    [Parameter(Mandatory = $true)][string] $ExpectedOwner,
    [Parameter(Mandatory = $true)][System.Diagnostics.Process] $OwnerProcess,
    [Parameter(Mandatory = $true)][datetime] $OwnerStartedAfter,
    [Parameter(Mandatory = $true)][string] $StandardOutputPath,
    [Parameter(Mandatory = $true)][string] $StandardErrorPath,
    [int] $TimeoutSeconds = 120
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $OwnerProcess.Refresh()
    if ($OwnerProcess.HasExited) {
      $Logs = Read-ProcessLogs $StandardOutputPath $StandardErrorPath
      throw "Edge tray owner smoke exited before it acquired the tray connection (code $($OwnerProcess.ExitCode)).`n$Logs"
    }

    $Summary = Get-ActiveBrowserSummary
    if (
      $Summary.sourceDisplayName -eq $ExpectedOwner -and
      $Summary.processRunning -and
      $Summary.processId
    ) {
      $ConnectionProcess = Get-Process -Id $Summary.processId -ErrorAction SilentlyContinue
      if (
        $ConnectionProcess -and
        $ConnectionProcess.StartTime -ge $OwnerStartedAfter.AddSeconds(-2)
      ) {
        Write-PreflightSummary -Summary $Summary -ExpectedOwner $ExpectedOwner
        return $Summary
      }
    }

    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $Deadline)

  $Summary = Get-ActiveBrowserSummary
  $Logs = Read-ProcessLogs $StandardOutputPath $StandardErrorPath
  throw "Edge tray owner smoke did not acquire the tray connection. Preflight summary: $(ConvertTo-PreflightJson $Summary)`n$Logs"
}

function Assert-FirefoxNativeHostRegistered {
  $RegistrySubKey = "Software\Mozilla\NativeMessagingHosts\$HostName"
  $BaseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::CurrentUser,
    [Microsoft.Win32.RegistryView]::Registry64
  )
  try {
    $Key = $BaseKey.OpenSubKey($RegistrySubKey)
    if (-not $Key) {
      throw "Firefox native messaging host is not registered in the 64-bit HKCU registry view at $RegistrySubKey. Install YTM Tray before running this smoke."
    }
    try {
      $ManifestPath = [string] $Key.GetValue("")
      if ([string]::IsNullOrWhiteSpace($ManifestPath) -or -not (Test-Path -LiteralPath $ManifestPath)) {
        throw "Firefox native messaging host points to a missing manifest: $ManifestPath"
      }
    } finally {
      $Key.Dispose()
    }
  } finally {
    $BaseKey.Dispose()
  }
}

$env:CI = "true"
$env:YTME_E2E_WINDOWS_TRAY_CONTENTION = "1"
$env:YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL = $ExpectedOwner

Assert-RepoRoot
. "$PSScriptRoot\ensure-pnpm.ps1"
Ensure-Pnpm

if ($PreflightOnly) {
  Assert-ActiveBrowserOwner -ExpectedOwner $ExpectedOwner
  Assert-FirefoxNativeHostRegistered
  Write-StatusLine "YTM Tray contention preflight passed."
  exit 0
}

Invoke-Pnpm install --frozen-lockfile
Invoke-Pnpm exec playwright install firefox
Invoke-Pnpm run dev:build:edge
Invoke-Pnpm run dev:build:firefox

$PnpmCommand = Get-PnpmCommand
if (-not $PnpmCommand) {
  throw "pnpm is required but was not found on PATH."
}

$RunId = [Guid]::NewGuid().ToString("N")
$HoldReleasePath = Join-Path $env:TEMP "ytme-tray-contention-$RunId.release"
$EdgeStandardOutputPath = Join-Path $env:TEMP "ytme-tray-contention-$RunId.out.log"
$EdgeStandardErrorPath = Join-Path $env:TEMP "ytme-tray-contention-$RunId.err.log"
$EdgeExitCodePath = Join-Path $env:TEMP "ytme-tray-contention-$RunId.exit"
$EdgeOutputPath = Join-Path $env:TEMP "ytme-own-$RunId"
$FirefoxOutputPath = Join-Path $env:TEMP "ytme-con-$RunId"
$EdgeProcess = $null
$EdgeFailure = $null
$ContentionFailure = $null

try {
  $env:YTME_E2E_WINDOWS_TRAY = "1"
  $env:YTME_WINDOWS_TRAY_HOLD_RELEASE_PATH = $HoldReleasePath
  $env:YTME_WINDOWS_TRAY_HOLD_TIMEOUT_SECONDS = "300"

  $PnpmLiteral = "'" + $PnpmCommand.Replace("'", "''") + "'"
  $EdgeOutputLiteral = "'" + $EdgeOutputPath.Replace("'", "''") + "'"
  $EdgeExitCodeLiteral = "'" + $EdgeExitCodePath.Replace("'", "''") + "'"
  $EdgeCommand = "& $PnpmLiteral exec playwright test tests/e2e/windows-tray-connector.spec.ts --project=edge --workers=1 --output $EdgeOutputLiteral; `$RecordedExitCode = if (`$LASTEXITCODE -is [int]) { `$LASTEXITCODE } else { 1 }; [IO.File]::WriteAllText($EdgeExitCodeLiteral, [string]`$RecordedExitCode); exit `$RecordedExitCode"
  $EncodedEdgeCommand = [Convert]::ToBase64String(
    [Text.Encoding]::Unicode.GetBytes($EdgeCommand)
  )
  $OwnerStartedAfter = Get-Date
  $EdgeProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      $EncodedEdgeCommand
    ) `
    -WorkingDirectory (Get-Location).Path `
    -RedirectStandardOutput $EdgeStandardOutputPath `
    -RedirectStandardError $EdgeStandardErrorPath `
    -PassThru `
    -WindowStyle Hidden

  Wait-ActiveBrowserOwner `
    -ExpectedOwner $ExpectedOwner `
    -OwnerProcess $EdgeProcess `
    -OwnerStartedAfter $OwnerStartedAfter `
    -StandardOutputPath $EdgeStandardOutputPath `
    -StandardErrorPath $EdgeStandardErrorPath |
    Out-Null
  Assert-FirefoxNativeHostRegistered
  Invoke-Pnpm exec playwright test tests/e2e/windows-tray-contention.spec.ts --project=firefox --workers=1 --output $FirefoxOutputPath
} catch {
  $ContentionFailure = $_
} finally {
  New-Item -ItemType File -Path $HoldReleasePath -Force | Out-Null
  Remove-Item Env:YTME_E2E_WINDOWS_TRAY -ErrorAction SilentlyContinue
  Remove-Item Env:YTME_WINDOWS_TRAY_HOLD_RELEASE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:YTME_WINDOWS_TRAY_HOLD_TIMEOUT_SECONDS -ErrorAction SilentlyContinue

  if ($EdgeProcess) {
    try {
      if (-not $EdgeProcess.WaitForExit(240000)) {
        $EdgeFailure = "Edge tray owner smoke did not exit within 240 seconds."
        Stop-Process -Id $EdgeProcess.Id -Force -ErrorAction SilentlyContinue
      } elseif (-not (Test-Path -LiteralPath $EdgeExitCodePath)) {
        $EdgeFailure = "Edge tray owner smoke did not record an exit code."
      } else {
        $EdgeExitCodeText = Get-Content -LiteralPath $EdgeExitCodePath -Raw
        $EdgeExitCode = 0
        if (-not [int]::TryParse($EdgeExitCodeText.Trim(), [ref] $EdgeExitCode)) {
          $EdgeFailure = "Edge tray owner smoke recorded an invalid exit code: $EdgeExitCodeText"
        } elseif ($EdgeExitCode -ne 0) {
          $EdgeFailure = "Edge tray owner smoke exited with code $EdgeExitCode."
        }
      }
    } catch {
      $EdgeFailure = $_.Exception.Message
      Stop-Process -Id $EdgeProcess.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

$EdgeLogs = Read-ProcessLogs $EdgeStandardOutputPath $EdgeStandardErrorPath
Remove-Item -LiteralPath $HoldReleasePath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $EdgeStandardOutputPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $EdgeStandardErrorPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $EdgeExitCodePath -Force -ErrorAction SilentlyContinue

if ($ContentionFailure) {
  throw "Tray contention validation failed: $($ContentionFailure.Exception.Message)`n$EdgeLogs"
}
if ($EdgeFailure) {
  throw "Edge tray owner validation failed: $EdgeFailure`n$EdgeLogs"
}

Remove-Item -LiteralPath $EdgeOutputPath -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $FirefoxOutputPath -Recurse -Force -ErrorAction SilentlyContinue
Write-StatusLine "YTM Tray contention smoke passed with a live Edge owner and Firefox contender."

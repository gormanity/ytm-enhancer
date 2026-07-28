param(
  [string] $OutputPath = (Join-Path (Get-Location) "apps/windows-tray/release/windows-tray-screenshot.png"),
  [string] $PlaybackUrl = $env:YTME_WINDOWS_TRAY_SCREENSHOT_PLAYBACK_URL,
  [string] $SignedInstallerPath = $env:YTME_WINDOWS_TRAY_SIGNED_INSTALLER_PATH
)

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

$ResolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$OutputDirectory = Split-Path -Parent $ResolvedOutputPath
if ($OutputDirectory) {
  New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
}

if ([string]::IsNullOrWhiteSpace($PlaybackUrl)) {
  throw "Set -PlaybackUrl or YTME_WINDOWS_TRAY_SCREENSHOT_PLAYBACK_URL to the approved Creative Commons YouTube Music track."
}

if ([string]::IsNullOrWhiteSpace($SignedInstallerPath)) {
  Remove-Item `
    Env:YTME_WINDOWS_TRAY_SIGNED_INSTALLER_PATH `
    -ErrorAction SilentlyContinue
} else {
  $ResolvedSignedInstallerPath = (
    Resolve-Path -LiteralPath $SignedInstallerPath
  ).ProviderPath
  if (
    [IO.Path]::GetExtension($ResolvedSignedInstallerPath) -ine ".exe"
  ) {
    throw "Signed YTM Tray installer must be an executable: $ResolvedSignedInstallerPath"
  }

  $Signature = Get-AuthenticodeSignature `
    -LiteralPath $ResolvedSignedInstallerPath
  if (
    $Signature.Status -ne
      [System.Management.Automation.SignatureStatus]::Valid -or
    $null -eq $Signature.SignerCertificate
  ) {
    throw "Expected a valid Authenticode signature on $ResolvedSignedInstallerPath; got $($Signature.Status): $($Signature.StatusMessage)"
  }

  $env:YTME_WINDOWS_TRAY_SIGNED_INSTALLER_PATH = `
    $ResolvedSignedInstallerPath
}

$env:CI = "true"
$env:YTME_E2E_WINDOWS_TRAY = "1"
$env:YTME_WINDOWS_TRAY_SCREENSHOT_PATH = $ResolvedOutputPath
$env:YTME_WINDOWS_TRAY_SCREENSHOT_PLAYBACK_URL = $PlaybackUrl
Remove-Item Env:YTM_TRAY_VISUAL_DEMO -ErrorAction SilentlyContinue
Remove-Item Env:YTM_TRAY_VISUAL_STATUS -ErrorAction SilentlyContinue
Remove-Item Env:YTM_TRAY_SCROLL_QA -ErrorAction SilentlyContinue

. "$PSScriptRoot\ensure-pnpm.ps1"
Ensure-Pnpm
Invoke-Pnpm install --frozen-lockfile
Invoke-Pnpm run dev:build:edge
Invoke-Pnpm exec playwright test `
  tests/e2e/windows-tray-connector.spec.ts `
  --project=edge `
  --workers=1

if (-not (Test-Path -LiteralPath $ResolvedOutputPath)) {
  throw "Expected Windows tray screenshot was not created: $ResolvedOutputPath"
}

Write-Output "Windows tray release screenshot captured."

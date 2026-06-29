param(
  [string] $OutputPath = (Join-Path (Get-Location) "apps/windows-tray/release/windows-tray-screenshot.png")
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

$env:CI = "true"
$env:YTME_E2E_WINDOWS_TRAY = "1"
$env:YTME_WINDOWS_TRAY_SCREENSHOT_PATH = $ResolvedOutputPath

Invoke-Native corepack enable
Invoke-Native corepack prepare pnpm@11.9.0 --activate
Invoke-Native pnpm install --frozen-lockfile
Invoke-Native pnpm run dev:build:edge
Invoke-Native pnpm exec playwright test `
  tests/e2e/windows-tray-connector.spec.ts `
  --project=edge `
  --workers=1

if (-not (Test-Path -LiteralPath $ResolvedOutputPath)) {
  throw "Expected Windows tray screenshot was not created: $ResolvedOutputPath"
}

Write-Output "Windows tray release screenshot: $ResolvedOutputPath"

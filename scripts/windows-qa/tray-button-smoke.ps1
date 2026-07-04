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

$env:CI = "true"
$env:YTME_E2E_WINDOWS_TRAY = "1"

. "$PSScriptRoot\ensure-pnpm.ps1"
Ensure-Pnpm
Invoke-Pnpm install --frozen-lockfile
Invoke-Pnpm exec playwright install firefox
Invoke-Pnpm run dev:build:edge
Invoke-Pnpm run dev:build:firefox
Invoke-Pnpm exec playwright test tests/e2e/windows-tray-connector.spec.ts --project=edge --project=firefox --workers=1

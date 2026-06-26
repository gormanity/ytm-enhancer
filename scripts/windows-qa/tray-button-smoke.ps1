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

Invoke-Native corepack enable
Invoke-Native corepack prepare pnpm@11.9.0 --activate
Invoke-Native pnpm install --frozen-lockfile
Invoke-Native pnpm exec playwright install firefox
Invoke-Native pnpm run dev:build:edge
Invoke-Native pnpm run dev:build:firefox
Invoke-Native pnpm exec playwright test tests/e2e/windows-tray-connector.spec.ts --project=edge --project=firefox --workers=1

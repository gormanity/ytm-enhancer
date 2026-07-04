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

. "$PSScriptRoot\ensure-pnpm.ps1"
Ensure-Pnpm
Invoke-Pnpm install --frozen-lockfile
Invoke-Pnpm run dev:build:edge
Invoke-Pnpm exec playwright test tests/e2e --project=edge

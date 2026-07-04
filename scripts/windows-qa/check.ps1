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
$env:GOCACHE = Join-Path $env:TEMP "ytm-enhancer-go-build"

. "$PSScriptRoot\ensure-pnpm.ps1"
Ensure-Pnpm
Invoke-Pnpm install --frozen-lockfile
Invoke-Pnpm run format:check
Invoke-Pnpm run lint
Invoke-Pnpm run css:dead
Invoke-Pnpm run data-role:check
Invoke-Pnpm run typecheck
Invoke-Pnpm run test
Invoke-Native go -C apps/cli test ./...
Invoke-Pnpm run build:chrome
Invoke-Pnpm run build:firefox
Invoke-Pnpm run lint:addons:firefox:dist
Invoke-Pnpm run build:edge
Invoke-Pnpm run dev:build:edge

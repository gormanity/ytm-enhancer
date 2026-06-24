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

Invoke-Native corepack enable
Invoke-Native corepack prepare pnpm@11.9.0 --activate
Invoke-Native pnpm install --frozen-lockfile
Invoke-Native pnpm run format:check
Invoke-Native pnpm run lint
Invoke-Native pnpm run css:dead
Invoke-Native pnpm run data-role:check
Invoke-Native pnpm run typecheck
Invoke-Native pnpm run test
Invoke-Native go -C apps/cli test ./...
Invoke-Native pnpm run build:chrome
Invoke-Native pnpm run build:firefox
Invoke-Native pnpm run lint:addons:firefox:dist
Invoke-Native pnpm run build:edge
Invoke-Native pnpm run dev:build:edge

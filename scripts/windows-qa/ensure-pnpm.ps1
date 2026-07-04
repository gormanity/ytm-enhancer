$ErrorActionPreference = "Stop"

function Get-PnpmVersion {
  $PnpmCommand = Get-PnpmCommand
  if (-not $PnpmCommand) {
    return $null
  }

  $VersionOutput = & $PnpmCommand --version
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm --version exited with code $LASTEXITCODE"
  }

  return $VersionOutput.Trim()
}

function Get-PnpmCommand {
  $PnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($PnpmCommand) {
    return $PnpmCommand.Source
  }

  $PnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($PnpmCommand) {
    return $PnpmCommand.Source
  }

  return $null
}

function Invoke-PnpmBootstrapCommand {
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

function Ensure-Pnpm {
  param(
    [string] $RequiredVersion = "11.9.0"
  )

  $ActiveVersion = Get-PnpmVersion
  if ($ActiveVersion -eq $RequiredVersion) {
    return
  }

  $CorepackCommand = Get-Command corepack -ErrorAction SilentlyContinue
  if ($CorepackCommand) {
    Invoke-PnpmBootstrapCommand $CorepackCommand.Source enable
    Invoke-PnpmBootstrapCommand $CorepackCommand.Source prepare "pnpm@$RequiredVersion" --activate
  }

  $ActiveVersion = Get-PnpmVersion
  if ($ActiveVersion -eq $RequiredVersion) {
    return
  }

  if ([string]::IsNullOrWhiteSpace($ActiveVersion)) {
    throw "pnpm $RequiredVersion is required. Install it with Corepack or run: npm install -g pnpm@$RequiredVersion"
  }

  throw "pnpm $RequiredVersion is required, but pnpm $ActiveVersion is active."
}

function Invoke-Pnpm {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  $PnpmCommand = Get-PnpmCommand
  if (-not $PnpmCommand) {
    throw "pnpm is required but was not found on PATH."
  }

  Invoke-PnpmBootstrapCommand $PnpmCommand @Arguments
}

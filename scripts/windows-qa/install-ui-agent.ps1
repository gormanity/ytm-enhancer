param(
  [string] $AgentRoot = (Join-Path $env:LOCALAPPDATA "YTM Enhancer\WindowsQaAgent")
)

$ErrorActionPreference = "Stop"

$AgentFiles = @(
  "start-ui-agent.ps1",
  "restart-ui-agent.ps1",
  "invoke-ui-agent.ps1",
  "ui-agent-common.ps1",
  "ui-agent-client.ps1"
)

New-Item -ItemType Directory -Force -Path $AgentRoot | Out-Null

foreach ($FileName in $AgentFiles) {
  $SourcePath = Join-Path $PSScriptRoot $FileName
  $DestinationPath = Join-Path $AgentRoot $FileName
  if (
    [System.IO.Path]::GetFullPath($SourcePath) -ieq
    [System.IO.Path]::GetFullPath($DestinationPath)
  ) {
    continue
  }

  Copy-Item `
    -LiteralPath $SourcePath `
    -Destination $DestinationPath `
    -Force
}

$LauncherPath = Join-Path $AgentRoot "start-ui-agent.cmd"
$LauncherLines = @(
  "@echo off",
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""%~dp0start-ui-agent.ps1""",
  "pause"
)
Set-Content -LiteralPath $LauncherPath -Value $LauncherLines -Encoding ascii

[pscustomobject]@{
  ok = $true
  agentRoot = $AgentRoot
  launcherPath = $LauncherPath
} | ConvertTo-Json -Depth 4

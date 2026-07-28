param(
  [string] $AgentRoot = (Join-Path $env:LOCALAPPDATA "YTM Enhancer\WindowsQaAgent"),
  [int] $ShutdownTimeoutSeconds = 5
)

$ErrorActionPreference = "Stop"

$Process = Get-Process -Id $PID
if ($Process.SessionId -eq 0) {
  throw "Windows QA UI agent restart must run from the logged-in desktop session, not SSH/session 0."
}

$InvokeAgentPath = Join-Path $AgentRoot "invoke-ui-agent.ps1"
$StartAgentPath = Join-Path $AgentRoot "start-ui-agent.ps1"

if (-not (Test-Path -LiteralPath $InvokeAgentPath)) {
  throw "Windows QA UI agent client is missing."
}

if (-not (Test-Path -LiteralPath $StartAgentPath)) {
  throw "Windows QA UI agent launcher is missing."
}

# Let an agent-launched restart request finish before connecting back to it.
Start-Sleep -Seconds 2

try {
  & $InvokeAgentPath `
    -Action Shutdown `
    -TimeoutSeconds $ShutdownTimeoutSeconds | Out-Null
} catch {
  Write-Warning "Existing Windows QA UI agent did not shut down cleanly."
}

Start-Sleep -Seconds 1

$QuotedStartAgentPath = (
  '"' +
  $StartAgentPath.Replace('"', '\"') +
  '"'
)
$StartedProcess = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList (
    "-NoProfile -ExecutionPolicy Bypass " +
    "-File $QuotedStartAgentPath"
  ) `
  -WindowStyle Hidden `
  -PassThru

[pscustomobject] @{
  ok = $true
  processId = $StartedProcess.Id
} | ConvertTo-Json -Depth 4

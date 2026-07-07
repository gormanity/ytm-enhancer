$ErrorActionPreference = "Stop"

function Invoke-WindowsQaUiAgentProbe {
  param(
    [switch] $LaunchProbe,
    [int] $TimeoutSeconds = 10
  )

  $Output = & "$PSScriptRoot\invoke-ui-agent.ps1" `
    -Action Probe `
    -LaunchProbe:$LaunchProbe `
    -TimeoutSeconds $TimeoutSeconds
  return $Output | ConvertFrom-Json
}

function Invoke-WindowsQaUiAgentLaunch {
  param(
    [Parameter(Mandatory = $true)][string] $FilePath,
    [string[]] $Arguments = @(),
    [string] $WorkingDirectory = "",
    [int] $WaitMilliseconds = 500,
    [int] $TimeoutSeconds = 10
  )

  $Output = & "$PSScriptRoot\invoke-ui-agent.ps1" `
    -Action Launch `
    -FilePath $FilePath `
    -Arguments $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -WaitMilliseconds $WaitMilliseconds `
    -TimeoutSeconds $TimeoutSeconds
  return $Output | ConvertFrom-Json
}

function Get-WindowsQaUiAgentReadiness {
  param([int] $TimeoutSeconds = 10)

  $Probe = Invoke-WindowsQaUiAgentProbe `
    -LaunchProbe `
    -TimeoutSeconds $TimeoutSeconds
  $Message = ""
  $Ready = $true

  if ($Probe.sessionId -eq 0) {
    $Ready = $false
    $Message = "Windows QA UI agent is running in session 0. Start it from the logged-in Windows desktop session."
  } elseif (-not $Probe.hasExplorerInAgentSession) {
    $Ready = $false
    $Message = "Windows QA UI agent session $($Probe.sessionId) does not have an explorer.exe desktop shell. Explorer sessions: $($Probe.explorerSessionIds -join ', ')"
  } elseif ($Probe.hasLogonUiInAgentSession) {
    $Ready = $false
    $Message = "Windows QA UI agent session $($Probe.sessionId) is locked or at the Windows sign-in screen. Unlock the Windows QA desktop session before running UI smoke. LogonUI sessions: $($Probe.logonUiSessionIds -join ', ')"
  } elseif ($Probe.launchedProbeSessionId -ne $Probe.sessionId) {
    $Ready = $false
    $Message = "Windows QA UI agent probe launched in session $($Probe.launchedProbeSessionId), expected $($Probe.sessionId)."
  }

  return [pscustomobject] @{
    ok = $Ready
    message = $Message
    probe = $Probe
  }
}

function Assert-WindowsQaUiAgentReady {
  param([int] $TimeoutSeconds = 10)

  $Readiness = Get-WindowsQaUiAgentReadiness -TimeoutSeconds $TimeoutSeconds
  if (-not $Readiness.ok) {
    throw $Readiness.message
  }

  return $Readiness.probe
}

function Wait-WindowsQaUiAgentReady {
  param(
    [int] $TimeoutSeconds = 60,
    [int] $ProbeTimeoutSeconds = 10
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $LastMessage = ""

  while ((Get-Date) -lt $Deadline) {
    try {
      $Readiness = Get-WindowsQaUiAgentReadiness `
        -TimeoutSeconds $ProbeTimeoutSeconds
      if ($Readiness.ok) {
        return $Readiness.probe
      }
      $LastMessage = $Readiness.message
    } catch {
      $LastMessage = $_.Exception.Message
    }

    Start-Sleep -Seconds 2
  }

  if ([string]::IsNullOrWhiteSpace($LastMessage)) {
    $LastMessage = "No readiness probe completed."
  }

  throw "Windows QA UI agent was not ready after $TimeoutSeconds seconds. $LastMessage"
}

function Invoke-InteractivePowerShell {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [string[]] $ScriptLines,
    [Parameter(Mandatory = $true)]
    [string] $ResultPath,
    [int] $TimeoutSeconds = 120
  )

  $ScriptPath = Join-Path $env:TEMP "YTMEnhancerWindowsQa-$Name-$PID.ps1"

  if (Test-Path -LiteralPath $ResultPath) {
    Remove-Item -LiteralPath $ResultPath -Force
  }

  Set-Content -LiteralPath $ScriptPath -Value $ScriptLines -Encoding UTF8

  try {
    $Launch = Invoke-WindowsQaUiAgentLaunch `
      -FilePath "powershell.exe" `
      -Arguments @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $ScriptPath
      ) `
      -TimeoutSeconds 10

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $Deadline -and -not (Test-Path -LiteralPath $ResultPath)) {
      Start-Sleep -Milliseconds 500
    }

    if (-not (Test-Path -LiteralPath $ResultPath)) {
      $ProcessState = Get-Process -Id $Launch.processId -ErrorAction SilentlyContinue
      $ProcessDescription = if ($ProcessState) {
        "running pid=$($ProcessState.Id) session=$($ProcessState.SessionId)"
      } else {
        "not running pid=$($Launch.processId) session=$($Launch.sessionId)"
      }

      throw "$Name did not create $ResultPath. Agent-launched process is $ProcessDescription."
    }

    $Payload = Get-Content -LiteralPath $ResultPath -Raw | ConvertFrom-Json
    if (-not $Payload.ok) {
      throw "$Name failed: $($Payload.error)`n$($Payload.scriptStack)"
    }

    return $Payload
  } finally {
    if (Test-Path -LiteralPath $ScriptPath) {
      Remove-Item -LiteralPath $ScriptPath -Force
    }
  }
}

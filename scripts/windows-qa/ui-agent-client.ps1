$ErrorActionPreference = "Stop"

function Invoke-WindowsQaDialogOk {
  param(
    [Parameter(Mandatory = $true)]
    [int] $WindowHandle,
    [int] $ButtonHandle = 0
  )

  if ($WindowHandle -eq 0) {
    throw "The Windows QA dialog does not expose a native window handle."
  }

  if (-not ("YtmEnhancerWindowsQaNativeMethods" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class YtmEnhancerWindowsQaNativeMethods
{
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PostMessage(
        IntPtr windowHandle,
        uint message,
        IntPtr wordParameter,
        IntPtr longParameter
    );

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetDlgItem(
        IntPtr dialogHandle,
        int controlId
    );

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetActiveWindow(IntPtr windowHandle);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindow(IntPtr windowHandle);
}
"@
  }

  $DialogResultOk = 1
  $UnsignedWindowHandle = [BitConverter]::ToUInt32(
    [BitConverter]::GetBytes($WindowHandle),
    0
  )
  $DialogHandle = [IntPtr] ([long] $UnsignedWindowHandle)
  if (-not [YtmEnhancerWindowsQaNativeMethods]::IsWindow($DialogHandle)) {
    throw "The Windows QA dialog handle is not a valid window."
  }

  $OkButtonHandle = [IntPtr]::Zero
  if ($ButtonHandle -ne 0) {
    $UnsignedButtonHandle = [BitConverter]::ToUInt32(
      [BitConverter]::GetBytes($ButtonHandle),
      0
    )
    $CandidateButtonHandle = [IntPtr] ([long] $UnsignedButtonHandle)
    if ([YtmEnhancerWindowsQaNativeMethods]::IsWindow($CandidateButtonHandle)) {
      $OkButtonHandle = $CandidateButtonHandle
    }
  }
  if ($OkButtonHandle -eq [IntPtr]::Zero) {
    $OkButtonHandle = [YtmEnhancerWindowsQaNativeMethods]::GetDlgItem(
      $DialogHandle,
      $DialogResultOk
    )
  }
  if ($OkButtonHandle -eq [IntPtr]::Zero) {
    throw "The Windows QA dialog does not expose a native OK button."
  }

  [void] [YtmEnhancerWindowsQaNativeMethods]::SetActiveWindow($DialogHandle)
  $ButtonClickMessage = 0x00F5
  if (-not [YtmEnhancerWindowsQaNativeMethods]::PostMessage(
      $OkButtonHandle,
      $ButtonClickMessage,
      [IntPtr]::Zero,
      [IntPtr]::Zero
    )) {
    $ErrorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw [ComponentModel.Win32Exception]::new(
      $ErrorCode,
      "The Windows QA dialog button could not be invoked."
    )
  }

  $DialogCloseDeadline = (Get-Date).AddSeconds(5)
  while (
    [YtmEnhancerWindowsQaNativeMethods]::IsWindow($DialogHandle) -and
    (Get-Date) -lt $DialogCloseDeadline
  ) {
    Start-Sleep -Milliseconds 50
  }
  if ([YtmEnhancerWindowsQaNativeMethods]::IsWindow($DialogHandle)) {
    throw "The Windows QA dialog remained open after its OK button was invoked."
  }
}

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

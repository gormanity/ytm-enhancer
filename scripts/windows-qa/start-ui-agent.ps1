param(
  [string] $PipeName = "",
  [switch] $AllowSessionZero,
  [int] $IdleTimeoutSeconds = 0,
  [int] $MaxRequests = 0
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\ui-agent-common.ps1"

Set-Location -LiteralPath $env:TEMP

if ([string]::IsNullOrWhiteSpace($PipeName)) {
  $PipeName = Get-WindowsQaAgentPipeName
}

$Process = Get-Process -Id $PID
if (-not $AllowSessionZero -and $Process.SessionId -eq 0) {
  throw "Windows QA UI agent must be started from the logged-in desktop session, not SSH/session 0."
}

function ConvertTo-StringArray {
  param($Value)

  if ($null -eq $Value) {
    return @()
  }

  if ($Value -is [array]) {
    return @($Value | ForEach-Object { [string] $_ })
  }

  return @([string] $Value)
}

function ConvertTo-WindowsCommandLineArgument {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string] $Value
  )

  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') {
    return $Value
  }

  $Builder = [Text.StringBuilder]::new()
  [void] $Builder.Append([char] 34)
  $BackslashCount = 0
  foreach ($Character in $Value.ToCharArray()) {
    if ([int] $Character -eq 92) {
      $BackslashCount += 1
      continue
    }
    if ([int] $Character -eq 34) {
      if ($BackslashCount -gt 0) {
        [void] $Builder.Append([char] 92, ($BackslashCount * 2))
      }
      [void] $Builder.Append([char] 92)
      [void] $Builder.Append([char] 34)
      $BackslashCount = 0
      continue
    }
    if ($BackslashCount -gt 0) {
      [void] $Builder.Append([char] 92, $BackslashCount)
      $BackslashCount = 0
    }
    [void] $Builder.Append($Character)
  }
  if ($BackslashCount -gt 0) {
    [void] $Builder.Append([char] 92, ($BackslashCount * 2))
  }
  [void] $Builder.Append([char] 34)
  return $Builder.ToString()
}

function Invoke-AgentProbe {
  param([Parameter(Mandatory = $true)] $Request)

  $AgentSessionId = (Get-Process -Id $PID).SessionId
  $ProbeSessionId = $null
  if ($Request.launchProbe) {
    $ProbeScriptPath = Join-Path $env:TEMP "YTMEnhancerWindowsQa-Probe-$PID.ps1"
    Set-Content `
      -LiteralPath $ProbeScriptPath `
      -Value "Start-Sleep -Seconds 5" `
      -Encoding UTF8

    $ProbeArguments = @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-File",
      $ProbeScriptPath
    )
    $ProbeCommandLine = (
      $ProbeArguments |
        ForEach-Object {
          ConvertTo-WindowsCommandLineArgument ([string] $_)
        }
    ) -join " "
    $ProbeProcess = Start-Process `
      -FilePath "powershell.exe" `
      -ArgumentList $ProbeCommandLine `
      -WindowStyle Hidden `
      -PassThru

    try {
      Start-Sleep -Milliseconds 500
      $StartedProbe = Get-Process -Id $ProbeProcess.Id -ErrorAction Stop
      $ProbeSessionId = $StartedProbe.SessionId
      Stop-Process -Id $StartedProbe.Id -Force -ErrorAction SilentlyContinue
    } finally {
      if (Test-Path -LiteralPath $ProbeScriptPath) {
        Remove-Item -LiteralPath $ProbeScriptPath -Force
      }
    }
  }

  $ExplorerSessions = @(
    Get-Process explorer -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty SessionId -Unique |
      Sort-Object
  )
  $LogonUiSessions = @(
    Get-Process LogonUI -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty SessionId -Unique |
      Sort-Object
  )
  $LockAppSessions = @(
    Get-Process LockApp -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty SessionId -Unique |
      Sort-Object
  )

  return @{
    ok = $true
    action = "probe"
    processId = $PID
    sessionId = $AgentSessionId
    explorerSessionIds = $ExplorerSessions
    hasExplorerInAgentSession = $ExplorerSessions -contains $AgentSessionId
    logonUiSessionIds = $LogonUiSessions
    lockAppSessionIds = $LockAppSessions
    hasLogonUiInAgentSession = $LogonUiSessions -contains $AgentSessionId
    launchedProbeSessionId = $ProbeSessionId
  }
}

function Invoke-AgentLaunch {
  param([Parameter(Mandatory = $true)] $Request)

  if ([string]::IsNullOrWhiteSpace($Request.filePath)) {
    throw "launch requires filePath."
  }

  $ExecutableName = [System.IO.Path]::GetFileName([string] $Request.filePath)
  if ($ExecutableName -notin @("powershell.exe", "pwsh.exe")) {
    throw "launch only supports PowerShell script execution."
  }

  $Arguments = ConvertTo-StringArray $Request.arguments
  $FileArgumentIndex = -1
  for ($Index = 0; $Index -lt $Arguments.Count; $Index += 1) {
    if ($Arguments[$Index] -ieq "-File") {
      $FileArgumentIndex = $Index
      break
    }
  }

  if ($FileArgumentIndex -lt 0 -or $FileArgumentIndex -ge ($Arguments.Count - 1)) {
    throw "launch requires a PowerShell -File argument."
  }

  $ScriptPath = [System.IO.Path]::GetFullPath($Arguments[$FileArgumentIndex + 1])
  $TempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if (-not $ScriptPath.StartsWith($TempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "launch only supports PowerShell scripts under the current user's temp directory."
  }

  $PreviousEnvironment = @{}
  if ($Request.environment) {
    foreach ($Property in $Request.environment.PSObject.Properties) {
      $PreviousEnvironment[$Property.Name] = [Environment]::GetEnvironmentVariable(
        $Property.Name,
        "Process"
      )
      [Environment]::SetEnvironmentVariable(
        $Property.Name,
        [string] $Property.Value,
        "Process"
      )
    }
  }

  try {
    $StartArguments = @{
      FilePath = [string] $Request.filePath
      PassThru = $true
      WindowStyle = "Hidden"
    }

    if ($Arguments.Count -gt 0) {
      $StartArguments.ArgumentList = (
        $Arguments |
          ForEach-Object {
            ConvertTo-WindowsCommandLineArgument ([string] $_)
          }
      ) -join " "
    }

    if (-not [string]::IsNullOrWhiteSpace($Request.workingDirectory)) {
      $StartArguments.WorkingDirectory = [string] $Request.workingDirectory
    }

    $StartedProcess = Start-Process @StartArguments
    $WaitMilliseconds = if ($Request.waitMilliseconds) {
      [int] $Request.waitMilliseconds
    } else {
      500
    }
    Start-Sleep -Milliseconds $WaitMilliseconds

    $ObservedProcess = Get-Process -Id $StartedProcess.Id -ErrorAction SilentlyContinue
    $ObservedSessionId = if ($ObservedProcess) {
      $ObservedProcess.SessionId
    } else {
      (Get-Process -Id $PID).SessionId
    }

    return @{
      ok = $true
      action = "launch"
      processId = $StartedProcess.Id
      processStillRunning = $null -ne $ObservedProcess
      sessionId = $ObservedSessionId
    }
  } finally {
    foreach ($Name in $PreviousEnvironment.Keys) {
      [Environment]::SetEnvironmentVariable(
        $Name,
        $PreviousEnvironment[$Name],
        "Process"
      )
    }
  }
}

function Invoke-AgentRequest {
  param([Parameter(Mandatory = $true)] $Request)

  switch ([string] $Request.action) {
    "probe" {
      return Invoke-AgentProbe -Request $Request
    }
    "launch" {
      return Invoke-AgentLaunch -Request $Request
    }
    "shutdown" {
      return @{
        ok = $true
        action = "shutdown"
        processId = $PID
        sessionId = (Get-Process -Id $PID).SessionId
      }
    }
    default {
      throw "Unsupported Windows QA UI agent action: $($Request.action)"
    }
  }
}

function New-AgentResponse {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock] $Body
  )

  try {
    return & $Body
  } catch {
    return @{
      ok = $false
      error = "Windows QA UI agent request failed."
      errorType = $_.Exception.GetType().Name
    }
  }
}

$Ready = @{
  ok = $true
  event = "ready"
  processId = $PID
  sessionId = $Process.SessionId
}
Write-Host (ConvertTo-AgentJson $Ready)

$RequestCount = 0
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
while ($true) {
  if ($MaxRequests -gt 0 -and $RequestCount -ge $MaxRequests) {
    break
  }

  if ($IdleTimeoutSeconds -gt 0 -and
      $Stopwatch.Elapsed.TotalSeconds -ge $IdleTimeoutSeconds) {
    break
  }

  $PipeSecurity = New-WindowsQaAgentPipeSecurity
  $Server = [System.IO.Pipes.NamedPipeServerStream]::new(
    $PipeName,
    [System.IO.Pipes.PipeDirection]::InOut,
    1,
    [System.IO.Pipes.PipeTransmissionMode]::Byte,
    [System.IO.Pipes.PipeOptions]::None,
    4096,
    4096,
    $PipeSecurity
  )

  try {
    $Server.WaitForConnection()
    $Stopwatch.Restart()
    $RequestCount += 1

    $Reader = [System.IO.StreamReader]::new(
      $Server,
      [System.Text.Encoding]::UTF8,
      $false,
      4096,
      $true
    )
    $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    $Writer = [System.IO.StreamWriter]::new(
      $Server,
      $Utf8NoBom,
      4096,
      $true
    )
    $Writer.AutoFlush = $true

    $RequestJson = $Reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($RequestJson)) {
      $Writer.WriteLine((ConvertTo-AgentJson @{
        ok = $false
        error = "Windows QA UI agent received an empty request."
      }))
      continue
    }

    $Request = $RequestJson | ConvertFrom-Json
    $Response = New-AgentResponse { Invoke-AgentRequest -Request $Request }
    $Writer.WriteLine((ConvertTo-AgentJson $Response))

    if ($Response.ok -and $Response.action -eq "shutdown") {
      break
    }

    if ($MaxRequests -gt 0 -and $RequestCount -ge $MaxRequests) {
      break
    }
  } finally {
    if ($Reader) {
      $Reader.Dispose()
    }
    if ($Writer) {
      $Writer.Dispose()
    }
    $Server.Dispose()
  }
}

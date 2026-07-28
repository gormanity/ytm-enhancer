param(
  [ValidateSet("Probe", "Launch", "Shutdown")]
  [string] $Action = "Probe",
  [string] $PipeName = "",
  [int] $TimeoutSeconds = 10,
  [switch] $LaunchProbe,
  [string] $FilePath = "",
  [string[]] $Arguments = @(),
  [string] $WorkingDirectory = "",
  [string] $EnvironmentJson = "",
  [int] $WaitMilliseconds = 500
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\ui-agent-common.ps1"

if ([string]::IsNullOrWhiteSpace($PipeName)) {
  $PipeName = Get-WindowsQaAgentPipeName
}

$Request = @{
  action = $Action.ToLowerInvariant()
}

if ($Action -eq "Probe") {
  $Request.launchProbe = [bool] $LaunchProbe
}

if ($Action -eq "Launch") {
  if ([string]::IsNullOrWhiteSpace($FilePath)) {
    throw "-FilePath is required for -Action Launch."
  }

  $Request.filePath = $FilePath
  $Request.arguments = $Arguments
  $Request.workingDirectory = $WorkingDirectory
  $Request.waitMilliseconds = $WaitMilliseconds

  if (-not [string]::IsNullOrWhiteSpace($EnvironmentJson)) {
    $Request.environment = $EnvironmentJson | ConvertFrom-Json
  }
}

$Client = [System.IO.Pipes.NamedPipeClientStream]::new(
  ".",
  $PipeName,
  [System.IO.Pipes.PipeDirection]::InOut
)

try {
  try {
    $Client.Connect($TimeoutSeconds * 1000)
  } catch {
    throw "Cannot connect to Windows QA UI agent. Start scripts/windows-qa/start-ui-agent.ps1 from the logged-in Windows desktop session first."
  }

  $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  $Writer = [System.IO.StreamWriter]::new(
    $Client,
    $Utf8NoBom,
    4096,
    $true
  )
  $Writer.AutoFlush = $true
  $Reader = [System.IO.StreamReader]::new(
    $Client,
    [System.Text.Encoding]::UTF8,
    $false,
    4096,
    $true
  )

  $Writer.WriteLine((ConvertTo-AgentJson $Request))
  $ResponseJson = $Reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($ResponseJson)) {
    throw "Windows QA UI agent returned an empty response."
  }

  $Response = $ResponseJson | ConvertFrom-Json
  if (-not $Response.ok) {
    throw "Windows QA UI agent failed: $($Response.error) Type: $($Response.errorType)"
  }

  $Response | ConvertTo-Json -Depth 8
} finally {
  if ($Reader) {
    $Reader.Dispose()
  }
  if ($Writer) {
    $Writer.Dispose()
  }
  $Client.Dispose()
}

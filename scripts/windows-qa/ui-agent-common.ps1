$ErrorActionPreference = "Stop"

function Get-WindowsQaAgentPipeName {
  $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $UserToken = if ($Identity.User) {
    $Identity.User.Value.Replace("-", "_")
  } else {
    $env:USERNAME.Replace(" ", "_")
  }

  return "ytm-enhancer-windows-qa-$UserToken"
}

function ConvertTo-AgentJson {
  param([Parameter(Mandatory = $true)] $Value)

  return $Value | ConvertTo-Json -Depth 8 -Compress
}

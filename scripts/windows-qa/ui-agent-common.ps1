$ErrorActionPreference = "Stop"

function Get-WindowsQaAgentUserFingerprint {
  $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $IdentityValue = if ($Identity.User) {
    $Identity.User.Value
  } else {
    $Identity.Name
  }
  $IdentityBytes = [System.Text.Encoding]::UTF8.GetBytes($IdentityValue)
  $Hasher = [System.Security.Cryptography.SHA256]::Create()

  try {
    $Hash = $Hasher.ComputeHash($IdentityBytes)
    return [System.BitConverter]::ToString($Hash).Replace("-", "").ToLowerInvariant()
  } finally {
    $Hasher.Dispose()
  }
}

function Get-WindowsQaAgentPipeName {
  $UserFingerprint = Get-WindowsQaAgentUserFingerprint
  return "ytm-enhancer-windows-qa-$($UserFingerprint.Substring(0, 24))"
}

function New-WindowsQaAgentPipeSecurity {
  $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  if ($null -eq $Identity.User) {
    throw "Windows QA UI agent could not resolve the current user SID."
  }

  $Security = [System.IO.Pipes.PipeSecurity]::new()
  $Security.SetAccessRuleProtection($true, $false)
  $Security.SetOwner($Identity.User)
  $AccessRule = [System.IO.Pipes.PipeAccessRule]::new(
    $Identity.User,
    [System.IO.Pipes.PipeAccessRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void] $Security.AddAccessRule($AccessRule)
  return $Security
}

function ConvertTo-AgentJson {
  param([Parameter(Mandatory = $true)] $Value)

  return $Value | ConvertTo-Json -Depth 8 -Compress
}

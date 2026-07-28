param(
  [string] $LogPath = (Join-Path ([Environment]::GetFolderPath("Desktop")) "YTM-Windows-QA-SSH-Repair.log"),
  [switch] $RepairFirewall,
  [switch] $RepairAdministratorKeys,
  [switch] $PauseOnExit
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = [Security.Principal.WindowsPrincipal]::new($Identity)
  return $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Section {
  param([Parameter(Mandatory = $true)][string] $Title)

  Write-Host ""
  Write-Host "== $Title =="
}

function Test-FirewallRuleTargetsSshd {
  param(
    [Parameter(Mandatory = $true)] $Rule,
    $FilterInventory = $null
  )

  if ($null -eq $FilterInventory) {
    $FilterInventory = Get-FirewallRuleFilterInventory $Rule
  }

  if (
    [string]::Equals(
      ([string] $FilterInventory.Service.Service).Trim(),
      "sshd",
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    return $true
  }

  foreach ($ApplicationPath in @(
    [string] $FilterInventory.Application.Program,
    [string] $FilterInventory.Application.AppPath
  )) {
    if ($ApplicationPath.Trim() -match "(?i)(?:^|[\\/])sshd\.exe$") {
      return $true
    }
  }

  return $false
}

function Test-GenericFirewallFilterValue {
  param([AllowNull()][string] $Value)

  $Normalized = ([string] $Value).Trim()
  return (
    $Normalized.Length -eq 0 -or
    [string]::Equals($Normalized, "Any", [StringComparison]::OrdinalIgnoreCase) -or
    $Normalized -eq "*"
  )
}

function Test-FirewallRuleHasGenericApplicationScope {
  param(
    [Parameter(Mandatory = $true)] $Rule,
    $FilterInventory = $null
  )

  if ($null -eq $FilterInventory) {
    $FilterInventory = Get-FirewallRuleFilterInventory $Rule
  }

  $ApplicationScopeValues = @(
    [string] $FilterInventory.Service.Service
    [string] $FilterInventory.Application.Program
    [string] $FilterInventory.Application.AppPath
    [string] $FilterInventory.Application.Package
    [string] $Rule.PackageFamilyName
    [string] $Rule.PolicyAppId
  )
  foreach ($Value in $ApplicationScopeValues) {
    if (-not (Test-GenericFirewallFilterValue $Value)) {
      return $false
    }
  }

  return $true
}

function Test-UniversalFirewallRemoteAddress {
  param([AllowNull()][string] $Address)

  $Normalized = ([string] $Address).Trim()
  foreach ($UniversalAddress in @(
    "Any",
    "*",
    "0.0.0.0/0",
    "::/0",
    "0.0.0.0-255.255.255.255",
    "::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"
  )) {
    if (
      [string]::Equals(
        $Normalized,
        $UniversalAddress,
        [StringComparison]::OrdinalIgnoreCase
      )
    ) {
      return $true
    }
  }

  return $false
}

function Test-UnsafeFirewallRemoteAddress {
  param([AllowNull()][string] $Address)

  $Normalized = ([string] $Address).Trim()
  if (
    $Normalized.Length -eq 0 -or
    (Test-UniversalFirewallRemoteAddress $Normalized)
  ) {
    return $true
  }

  foreach ($UnsafeKeyword in @(
    "defaultgateway",
    "dhcp",
    "dns",
    "internet",
    "intranet",
    "playtodevice",
    "wins"
  )) {
    if (
      [string]::Equals(
        $Normalized,
        $UnsafeKeyword,
        [StringComparison]::OrdinalIgnoreCase
      )
    ) {
      return $true
    }
  }

  return $false
}

function Get-FirewallRuleFilterInventory {
  param([Parameter(Mandatory = $true)] $Rule)

  $PortFilters = @(
    $Rule |
      Get-NetFirewallPortFilter -ErrorAction Stop
  )
  $ServiceFilters = @(
    $Rule |
      Get-NetFirewallServiceFilter -ErrorAction Stop
  )
  $ApplicationFilters = @(
    $Rule |
      Get-NetFirewallApplicationFilter -ErrorAction Stop
  )
  $AddressFilters = @(
    $Rule |
      Get-NetFirewallAddressFilter -ErrorAction Stop
  )

  if (
    $PortFilters.Count -ne 1 -or
    $ServiceFilters.Count -ne 1 -or
    $ApplicationFilters.Count -ne 1 -or
    $AddressFilters.Count -ne 1
  ) {
    throw "The existing OpenSSH firewall rule is not safely scoped."
  }

  return [pscustomobject]@{
    Port = $PortFilters[0]
    Service = $ServiceFilters[0]
    Application = $ApplicationFilters[0]
    Address = $AddressFilters[0]
  }
}

function Assert-SafeExistingOpenSshFirewallRule {
  param([Parameter(Mandatory = $true)] $Rule)

  $FilterInventory = Get-FirewallRuleFilterInventory $Rule
  $RemoteAddresses = @($FilterInventory.Address.RemoteAddress)
  $ExactSshPort = (
    [string] $FilterInventory.Port.Protocol -in @("TCP", "6") -and
    @($FilterInventory.Port.LocalPort).Count -eq 1 -and
    [string] $FilterInventory.Port.LocalPort -eq "22"
  )
  $ApplicationScopeIsSafe = (
    (Test-FirewallRuleTargetsSshd $Rule $FilterInventory) -or
    (Test-FirewallRuleHasGenericApplicationScope $Rule $FilterInventory)
  )
  if (
    [string] $Rule.Direction -ne "Inbound" -or
    [string] $Rule.Action -ne "Allow" -or
    -not $ExactSshPort -or
    -not $ApplicationScopeIsSafe -or
    $RemoteAddresses.Count -eq 0
  ) {
    throw "The existing OpenSSH firewall rule is not safely scoped."
  }

  return $FilterInventory
}

function Get-OpenSshFirewallRulesByName {
  param([Parameter(Mandatory = $true)][string] $Name)

  $Rules = @(
    Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction Stop |
      Where-Object {
        [string]::Equals(
          [string] $_.Name,
          $Name,
          [StringComparison]::OrdinalIgnoreCase
        )
      }
  )
  return $Rules
}

function Get-ValidatedAbsoluteFilePath {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $Description
  )

  if (-not [IO.Path]::IsPathRooted($Path)) {
    throw "$Description path is not absolute."
  }

  $FullPath = [IO.Path]::GetFullPath($Path)
  $PathRoot = [IO.Path]::GetPathRoot($FullPath)
  if ([string]::IsNullOrWhiteSpace($PathRoot)) {
    throw "$Description path has no filesystem root."
  }

  $CurrentPath = $PathRoot
  $RelativePath = $FullPath.Substring($PathRoot.Length)
  foreach ($PathPart in @(
    $RelativePath.Split(
      [char[]] @([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar),
      [StringSplitOptions]::RemoveEmptyEntries
    )
  )) {
    $CurrentPath = Join-Path $CurrentPath $PathPart
    $CurrentItem = Get-Item -LiteralPath $CurrentPath -Force -ErrorAction Stop
    if (
      ($CurrentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      throw "$Description path contains a reparse point."
    }
  }

  if ($CurrentItem.PSIsContainer) {
    throw "$Description path does not identify a regular file."
  }

  return [string] $CurrentItem.FullName
}

$WindowsPowerShellPath = Get-ValidatedAbsoluteFilePath `
  -Path (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe") `
  -Description "Windows PowerShell"

if (-not (Test-IsAdministrator)) {
  Write-Host "Requesting administrator permission..."
  $Arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "`"$PSCommandPath`"",
    "-LogPath",
    "`"$LogPath`""
  )
  if ($PauseOnExit) {
    $Arguments += "-PauseOnExit"
  }
  if ($RepairFirewall) {
    $Arguments += "-RepairFirewall"
  }
  if ($RepairAdministratorKeys.IsPresent) {
    $Arguments += "-RepairAdministratorKeys"
  }

  Start-Process -FilePath $WindowsPowerShellPath -ArgumentList $Arguments -Verb RunAs
  exit 0
}

$ExitCode = 0
Start-Transcript -Path $LogPath -Force
try {
  Write-Host "YTM Windows QA OpenSSH repair"
  Write-Host "Writing the repair transcript."

  Write-Section "OpenSSH Capability"
  $CapabilityName = "OpenSSH.Server~~~~0.0.1.0"
  $Capability = Get-WindowsCapability -Online -Name $CapabilityName -ErrorAction SilentlyContinue
  if ($null -eq $Capability -or $Capability.State -ne "Installed") {
    Write-Host "Installing OpenSSH Server optional capability..."
    Add-WindowsCapability -Online -Name $CapabilityName
  } else {
    Write-Host "OpenSSH Server optional capability is installed."
  }

  Write-Section "Host Keys"
  New-Item -ItemType Directory -Force -Path "$env:ProgramData\ssh" | Out-Null
  $SshKeygenPath = Get-ValidatedAbsoluteFilePath `
    -Path (Join-Path $env:SystemRoot "System32\OpenSSH\ssh-keygen.exe") `
    -Description "OpenSSH ssh-keygen"
  Write-Host "Ensuring OpenSSH host keys exist..."
  # This is the absolute-path equivalent of: ssh-keygen.exe -A
  & $SshKeygenPath -A
  if ($LASTEXITCODE -ne 0) {
    throw "OpenSSH host-key generation failed."
  }

  Write-Section "Service"
  $Service = Get-Service sshd -ErrorAction SilentlyContinue
  if ($null -eq $Service) {
    throw "OpenSSH Server service 'sshd' was not found after capability repair."
  }

  Set-Service sshd -StartupType Automatic
  Restart-Service sshd -Force

  if ($RepairFirewall) {
    Write-Section "Firewall"
    $RuleName = "OpenSSH-Server-In-TCP"
    $Rules = @(Get-OpenSshFirewallRulesByName $RuleName)
    if ($Rules.Count -eq 0) {
      Write-Host "Creating a Private, local-subnet OpenSSH firewall rule..."
      New-NetFirewallRule `
        -Name $RuleName `
        -DisplayName "OpenSSH Server (sshd)" `
        -Enabled True `
        -Direction Inbound `
        -Protocol TCP `
        -Action Allow `
        -LocalPort 22 `
        -Profile Private `
        -RemoteAddress LocalSubnet
    } else {
      if ($Rules.Count -ne 1) {
        throw "The existing OpenSSH firewall rule is not safely scoped."
      }
      $Rule = $Rules[0]
      $FilterInventory = Assert-SafeExistingOpenSshFirewallRule $Rule
      Write-Host "Enabling the existing OpenSSH firewall rule without widening its scope..."

      $Profile = [string] $Rule.Profile
      if (
        $Profile -ne "Private" -and
        $Profile -ne "Any" -and
        $Profile -notmatch "(^|,\s*)Private($|,)"
      ) {
        throw "The existing OpenSSH firewall rule is not safely scoped."
      }
      if ($Profile -ne "Private") {
        Set-NetFirewallRule -InputObject $Rule -Profile Private -ErrorAction Stop
      }

      $HasUnsafeRemoteAddress = $false
      foreach ($RemoteAddress in @($FilterInventory.Address.RemoteAddress)) {
        if (Test-UnsafeFirewallRemoteAddress ([string] $RemoteAddress)) {
          $HasUnsafeRemoteAddress = $true
        }
      }
      if ($HasUnsafeRemoteAddress) {
        $FilterInventory.Address |
          Set-NetFirewallAddressFilter `
            -RemoteAddress LocalSubnet `
            -ErrorAction Stop
      }
      Enable-NetFirewallRule -InputObject $Rule -ErrorAction Stop
    }
  } else {
    Write-Host "Firewall rules were not changed. Use -RepairFirewall explicitly if needed."
  }

  if ($RepairAdministratorKeys) {
    Write-Section "Administrator Authorized Keys ACL"
    $AdminKeyPath = "$env:ProgramData\ssh\administrators_authorized_keys"
    if (Test-Path -LiteralPath $AdminKeyPath -ErrorAction Stop) {
      $ValidatedAdminKeyPath = Get-ValidatedAbsoluteFilePath `
        -Path $AdminKeyPath `
        -Description "Administrator authorized-keys file"
      $IcaclsPath = Get-ValidatedAbsoluteFilePath `
        -Path (Join-Path $env:SystemRoot "System32\icacls.exe") `
        -Description "Windows ACL utility"
      Write-Host "Repairing the administrator authorized-keys ACL..."
      & $IcaclsPath $ValidatedAdminKeyPath /inheritance:r
      if ($LASTEXITCODE -ne 0) {
        throw "Removing inherited administrator authorized-keys ACLs failed."
      }
      & $IcaclsPath `
        $ValidatedAdminKeyPath `
        /grant:r `
        "*S-1-5-32-544:F" `
        "*S-1-5-18:F"
      if ($LASTEXITCODE -ne 0) {
        throw "Applying administrator authorized-keys ACLs failed."
      }
    } else {
      Write-Warning "The administrator authorized-keys file does not exist."
    }
  } else {
    Write-Host "Administrator keys were not changed."
    Write-Host "Use -RepairAdministratorKeys only for explicit administrator-login recovery."
  }

  Write-Section "Verification"
  Get-Service sshd | Format-List Name,Status,StartType
  $Listener = Get-NetTCPConnection -LocalPort 22 -State Listen |
    Select-Object -First 1
  if ($null -eq $Listener) {
    throw "OpenSSH is not listening on its configured port."
  }
  if (
    -not (
      Test-NetConnection 127.0.0.1 -Port 22 -InformationLevel Quiet
    )
  ) {
    throw "OpenSSH did not accept a local verification connection."
  }
  Write-Host "OpenSSH listener and local connection checks passed."

  Write-Host ""
  Write-Host "Done. Re-run scripts/remote/windows-qa/probe.sh from macOS."
} catch {
  $ExitCode = 1
  Write-Host ""
  Write-Host "Repair failed. Review the local setup log for details." `
    -ForegroundColor Red
} finally {
  Stop-Transcript
  if ($PauseOnExit) {
    Write-Host ""
    Read-Host "Press Enter to close"
  }
}

exit $ExitCode

param(
  [string] $LogPath = (Join-Path ([Environment]::GetFolderPath("Desktop")) "YTM-Windows-QA-SSH-Repair.log"),
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

  Start-Process -FilePath "powershell.exe" -ArgumentList $Arguments -Verb RunAs
  exit 0
}

$ExitCode = 0
Start-Transcript -Path $LogPath -Force
try {
  Write-Host "YTM Windows QA OpenSSH repair"
  Write-Host "Log: $LogPath"

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
  if (Get-Command ssh-keygen.exe -ErrorAction SilentlyContinue) {
    Write-Host "Ensuring OpenSSH host keys exist..."
    ssh-keygen.exe -A
  } else {
    Write-Warning "ssh-keygen.exe was not found on PATH."
  }

  Write-Section "Service"
  $Service = Get-Service sshd -ErrorAction SilentlyContinue
  if ($null -eq $Service) {
    throw "OpenSSH Server service 'sshd' was not found after capability repair."
  }

  Set-Service sshd -StartupType Automatic
  Restart-Service sshd -Force

  Write-Section "Firewall"
  $RuleName = "OpenSSH-Server-In-TCP"
  $Rule = Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue
  if ($null -eq $Rule) {
    Write-Host "Creating OpenSSH firewall rule..."
    New-NetFirewallRule `
      -Name $RuleName `
      -DisplayName "OpenSSH Server (sshd)" `
      -Enabled True `
      -Direction Inbound `
      -Protocol TCP `
      -Action Allow `
      -LocalPort 22 `
      -Profile Any
  } else {
    Write-Host "Updating OpenSSH firewall rule..."
    Enable-NetFirewallRule -Name $RuleName
    Set-NetFirewallRule -Name $RuleName -Profile Any -Action Allow -Direction Inbound
  }

  Write-Section "Authorized Keys ACL"
  $AdminKeyPath = "$env:ProgramData\ssh\administrators_authorized_keys"
  if (Test-Path -LiteralPath $AdminKeyPath) {
    Write-Host "Repairing administrators_authorized_keys ACL..."
    icacls.exe $AdminKeyPath /inheritance:r
    icacls.exe $AdminKeyPath /grant "*S-1-5-32-544:F" /grant "*S-1-5-18:F"
  } else {
    Write-Warning "No administrators_authorized_keys file found at $AdminKeyPath."
    Write-Warning "Key-based admin login still requires the QA public key in this file."
  }

  Write-Section "Verification"
  Get-Service sshd | Format-List Name,Status,StartType
  Get-NetTCPConnection -LocalPort 22 -State Listen |
    Format-Table LocalAddress,LocalPort,State -AutoSize
  Test-NetConnection 127.0.0.1 -Port 22

  Write-Host ""
  Write-Host "Done. Re-run scripts/remote/windows-qa/probe.sh from macOS."
} catch {
  $ExitCode = 1
  Write-Host ""
  Write-Host "Repair failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
  Stop-Transcript
  if ($PauseOnExit) {
    Write-Host ""
    Read-Host "Press Enter to close"
  }
}

exit $ExitCode

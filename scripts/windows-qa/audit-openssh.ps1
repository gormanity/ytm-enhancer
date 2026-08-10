[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ConfigPath = Join-Path $env:ProgramData "ssh\sshd_config"
$RestrictedFirewallRuleName = "YTM-Enhancer-QA-OpenSSH-In-TCP"
$ManagedBlockStart = "# BEGIN YTM Enhancer Windows QA hardening"
$AuditCorePath = Join-Path $PSScriptRoot "openssh-audit-core.ps1"

if (-not (Test-Path -LiteralPath $AuditCorePath -PathType Leaf)) {
  throw "The OpenSSH audit implementation was not found."
}

. $AuditCorePath
Invoke-OpenSshAudit

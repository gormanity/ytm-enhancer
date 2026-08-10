function Get-ActiveFirewallRulesByName {
  param([Parameter(Mandatory = $true)][string] $Name)

  return @(
    Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction Stop |
      Where-Object {
        [string]::Equals(
          [string] $_.Name,
          $Name,
          [StringComparison]::OrdinalIgnoreCase
        )
      }
  )
}

function Get-SshPortRules {
  $RulesByInstanceId = @{}
  $PortFilters = @(
    Get-NetFirewallPortFilter `
      -PolicyStore ActiveStore `
      -ErrorAction Stop
  )

  foreach ($PortFilter in $PortFilters) {
    if (-not (Test-PortFilterIncludesSsh $PortFilter)) {
      continue
    }

    foreach ($Rule in @(
      $PortFilter |
        Get-NetFirewallRule -ErrorAction Stop
    )) {
      $RuleInstanceId = ([string] $Rule.InstanceID).Trim()
      if (
        [string]::IsNullOrWhiteSpace($RuleInstanceId) -or
        $RulesByInstanceId.ContainsKey($RuleInstanceId)
      ) {
        throw "The SSH firewall inventory contains an invalid rule identity."
      }
      $RulesByInstanceId[$RuleInstanceId] = $Rule
    }
  }

  return @($RulesByInstanceId.Values)
}

function Test-PortFilterIncludesSsh {
  param([Parameter(Mandatory = $true)] $PortFilter)

  if (([string] $PortFilter.Protocol) -notin @("Any", "TCP", "6")) {
    return $false
  }

  foreach ($PortValue in @($PortFilter.LocalPort)) {
    foreach ($PortPart in ([string] $PortValue -split ",")) {
      $NormalizedPart = $PortPart.Trim()
      if ($NormalizedPart -eq "Any" -or $NormalizedPart -eq "22") {
        return $true
      }

      if ($NormalizedPart -match "^(\d+)-(\d+)$") {
        $FirstPort = [int] $Matches[1]
        $LastPort = [int] $Matches[2]
        if ($FirstPort -le 22 -and $LastPort -ge 22) {
          return $true
        }
      }
    }
  }

  return $false
}

function Test-RuleIsExactSshPortRule {
  param([Parameter(Mandatory = $true)] $Rule)

  $PortFilters = @(
    $Rule |
      Get-NetFirewallPortFilter -ErrorAction Stop
  )
  if ($PortFilters.Count -ne 1) {
    return $false
  }

  $PortFilter = $PortFilters[0]
  return (
    [string] $PortFilter.Protocol -in @("TCP", "6") -and
    @($PortFilter.LocalPort).Count -eq 1 -and
    [string] $PortFilter.LocalPort -eq "22"
  )
}

function Test-RuleTargetsSshd {
  param([Parameter(Mandatory = $true)] $Rule)

  foreach ($ServiceFilter in @(
    $Rule |
      Get-NetFirewallServiceFilter -ErrorAction Stop
  )) {
    if ([string] $ServiceFilter.Service -eq "sshd") {
      return $true
    }
  }

  foreach ($ApplicationFilter in @(
    $Rule |
      Get-NetFirewallApplicationFilter -ErrorAction Stop
  )) {
    foreach ($ApplicationPath in @(
      [string] $ApplicationFilter.Program,
      [string] $ApplicationFilter.AppPath
    )) {
      if ($ApplicationPath.Trim() -match "(?i)(?:^|[\\/])sshd\.exe$") {
        return $true
      }
    }
  }

  return $false
}

function Test-RuleHasGenericApplicationScope {
  param([Parameter(Mandatory = $true)] $Rule)

  $Services = @(
    $Rule |
      Get-NetFirewallServiceFilter -ErrorAction Stop |
      ForEach-Object { ([string] $_.Service).Trim() }
  )
  $ApplicationScopes = [Collections.Generic.List[string]]::new()
  foreach ($ApplicationFilter in @(
    $Rule |
      Get-NetFirewallApplicationFilter -ErrorAction Stop
  )) {
    $ApplicationScopes.Add(
      ([string] $ApplicationFilter.Program).Trim()
    )
    $ApplicationScopes.Add(
      ([string] $ApplicationFilter.AppPath).Trim()
    )
    $ApplicationScopes.Add(
      ([string] $ApplicationFilter.Package).Trim()
    )
  }
  $ApplicationScopes.Add(([string] $Rule.PackageFamilyName).Trim())
  $ApplicationScopes.Add(([string] $Rule.PolicyAppId).Trim())
  $ServiceIsGeneric = (
    $Services.Count -eq 0 -or
    @($Services | Where-Object { $_ -notin @("", "Any") }).Count -eq 0
  )
  $ApplicationIsGeneric = (
    $ApplicationScopes.Count -eq 0 -or
    @(
      $ApplicationScopes |
        Where-Object { $_ -notin @("", "Any") }
    ).Count -eq 0
  )

  return $ServiceIsGeneric -and $ApplicationIsGeneric
}

function Test-RuleIsAutoDisableSshRule {
  param([Parameter(Mandatory = $true)] $Rule)

  return (
    (Test-RuleTargetsSshd $Rule) -or
    (
      (Test-RuleIsExactSshPortRule $Rule) -and
      (Test-RuleHasGenericApplicationScope $Rule)
    )
  )
}

function Get-RuleRemoteAddresses {
  param([Parameter(Mandatory = $true)] $Rule)

  $AddressFilter = $Rule |
    Get-NetFirewallAddressFilter -ErrorAction Stop
  if ($null -eq $AddressFilter) {
    return @()
  }

  return @($AddressFilter.RemoteAddress | ForEach-Object { [string] $_ })
}

function Test-RuleIsEnabledInboundAllow {
  param([Parameter(Mandatory = $true)] $Rule)

  return (
    [string] $Rule.Enabled -eq "True" -and
    [string] $Rule.Direction -eq "Inbound" -and
    [string] $Rule.Action -eq "Allow"
  )
}

function Test-RuleHasRestrictedScope {
  param([Parameter(Mandatory = $true)] $Rule)

  if ([string] $Rule.Profile -ne "Private") {
    return $false
  }

  $Addresses = Get-RuleRemoteAddresses $Rule
  return (
    $Addresses.Count -gt 0 -and
    @(
      $Addresses |
        Where-Object { Test-RemoteAddressIsUniversal $_ }
    ).Count -eq 0
  )
}

function Test-RemoteAddressIsUniversal {
  param([Parameter(Mandatory = $true)][string] $Address)

  return $Address.Trim().ToLowerInvariant() -in @(
    "any",
    "*",
    "0.0.0.0/0",
    "::/0",
    "0.0.0.0-255.255.255.255",
    "::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"
  )
}

function Test-ManagedFirewallRule {
  param(
    [Parameter(Mandatory = $true)] $Rule,
    [Parameter(Mandatory = $true)][string[]] $ExpectedAddresses
  )

  if (
    -not (Test-RuleIsEnabledInboundAllow $Rule) -or
    -not (Test-RuleHasRestrictedScope $Rule) -or
    [string] $Rule.EdgeTraversalPolicy -ne "Block"
  ) {
    return $false
  }

  $PortFilter = $Rule |
    Get-NetFirewallPortFilter -ErrorAction Stop
  if (
    $null -eq $PortFilter -or
    [string] $PortFilter.Protocol -notin @("TCP", "6") -or
    @($PortFilter.LocalPort).Count -ne 1 -or
    [string] $PortFilter.LocalPort -ne "22"
  ) {
    return $false
  }

  $ServiceFilter = $Rule |
    Get-NetFirewallServiceFilter -ErrorAction Stop
  if ($null -eq $ServiceFilter -or [string] $ServiceFilter.Service -ne "sshd") {
    return $false
  }

  $Actual = @(
    Get-RuleRemoteAddresses $Rule |
      ForEach-Object { $_.Trim().ToLowerInvariant() } |
      Sort-Object -Unique
  )
  $Expected = @(
    $ExpectedAddresses |
      ForEach-Object { $_.Trim().ToLowerInvariant() } |
      Sort-Object -Unique
  )
  return (
    $Actual.Count -eq $Expected.Count -and
    -not (Compare-Object $Actual $Expected)
  )
}

function Get-EnabledBroadSshFirewallRuleCount {
  $Count = 0
  foreach ($Rule in (Get-SshPortRules)) {
    if (
      $Rule.Name -ne $RestrictedFirewallRuleName -and
      (Test-RuleIsEnabledInboundAllow $Rule) -and
      (
        (Test-RuleIsAutoDisableSshRule $Rule) -or
        (Test-RuleHasGenericApplicationScope $Rule)
      )
    ) {
      $Count += 1
    }
  }

  return $Count
}

function Get-EnabledGenericSshCoveringRuleCount {
  $Count = 0
  foreach ($Rule in (Get-SshPortRules)) {
    if (
      $Rule.Name -ne $RestrictedFirewallRuleName -and
      (Test-RuleIsEnabledInboundAllow $Rule) -and
      -not (Test-RuleIsAutoDisableSshRule $Rule) -and
      (Test-RuleHasGenericApplicationScope $Rule)
    ) {
      $Count += 1
    }
  }

  return $Count
}

function Write-SafeResult {
  param(
    [Parameter(Mandatory = $true)][string] $ResultMode,
    [Parameter(Mandatory = $true)][hashtable] $Values
  )

  $Result = [ordered]@{
    ok = $true
    mode = $ResultMode.ToLowerInvariant()
  }
  foreach ($Name in $Values.Keys) {
    $Result[$Name] = $Values[$Name]
  }

  [pscustomobject]$Result | ConvertTo-Json -Depth 4
}

function Invoke-OpenSshAudit {
  $ConfigHardened = $false
  if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
    $ConfigText = [IO.File]::ReadAllText($ConfigPath)
    $ConfigHardened = (
      $ConfigText.Contains($ManagedBlockStart) -and
      $ConfigText.Contains("AuthenticationMethods publickey") -and
      $ConfigText.Contains("PasswordAuthentication no") -and
      $ConfigText.Contains("DisableForwarding yes")
    )
  }

  $RestrictedRules = @(
    Get-ActiveFirewallRulesByName $RestrictedFirewallRuleName
  )
  if ($RestrictedRules.Count -gt 1) {
    throw "The managed firewall rule identity is ambiguous."
  }
  $RestrictedRule = if ($RestrictedRules.Count -eq 1) {
    $RestrictedRules[0]
  } else {
    $null
  }
  $RestrictedAddresses = if ($null -ne $RestrictedRule) {
    Get-RuleRemoteAddresses $RestrictedRule
  } else {
    @()
  }
  $RestrictedFirewall = (
    $null -ne $RestrictedRule -and
    (
      Test-ManagedFirewallRule `
        -Rule $RestrictedRule `
        -ExpectedAddresses $RestrictedAddresses
    )
  )
  $BroadRuleCount = Get-EnabledBroadSshFirewallRuleCount
  $GenericFirewallBlockerCount = Get-EnabledGenericSshCoveringRuleCount

  Write-SafeResult "Audit" @{
    configHardened = $ConfigHardened
    restrictedFirewall = $RestrictedFirewall
    broadFirewallRuleCount = $BroadRuleCount
    genericFirewallBlockerCount = $GenericFirewallBlockerCount
  }
}

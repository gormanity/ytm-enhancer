param(
  [ValidateSet("Audit", "Prepare", "Apply", "Verify", "Rollback")]
  [string] $Mode = "Audit",
  [string] $QaUser = "",
  [string] $PublicKeyPath = "",
  [string] $SshGroup = "YTMEnhancerQaSsh",
  [string[]] $RemoteAddress = @("LocalSubnet"),
  [ValidateRange(5, 60)]
  [int] $RollbackMinutes = 15,
  [string] $StateId = "",
  [switch] $ConfirmLocalRecovery,
  [switch] $ConfirmInitialKeyConnection,
  [switch] $ConfirmFinalKeyConnection,
  [switch] $FinalizeFirewall,
  [switch] $RequirePreviousRulesDisabled,
  [switch] $Commit,
  [switch] $FromScheduledTask
)

$ErrorActionPreference = "Stop"
$StateRoot = Join-Path $env:ProgramData "YTMEnhancerWindowsQaSshHardening"
$ConfigPath = Join-Path $env:ProgramData "ssh\sshd_config"
$RestrictedFirewallRuleName = "YTM-Enhancer-QA-OpenSSH-In-TCP"
$ManagedBlockStart = "# BEGIN YTM Enhancer Windows QA hardening"
$ManagedBlockEnd = "# END YTM Enhancer Windows QA hardening"
$AdministratorsSidValue = "S-1-5-32-544"
$SystemSidValue = "S-1-5-18"
$StateRootMarkerName = ".ytme-openssh-hardening-root"

function Test-IsAdministrator {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  if ($Identity.User.Value -eq $SystemSidValue) {
    return $true
  }

  $Principal = [Security.Principal.WindowsPrincipal]::new($Identity)
  return $Principal.IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
}

function Assert-IsAdministrator {
  if (-not (Test-IsAdministrator)) {
    throw "Run this command from a local elevated recovery console."
  }
}

function Assert-LocalRecoveryConsole {
  if (-not $ConfirmLocalRecovery) {
    throw "Pass -ConfirmLocalRecovery from a local elevated recovery console."
  }
  if (
    -not [string]::IsNullOrWhiteSpace($env:SSH_CLIENT) -or
    -not [string]::IsNullOrWhiteSpace($env:SSH_CONNECTION) -or
    -not [string]::IsNullOrWhiteSpace($env:SSH_TTY)
  ) {
    throw "OpenSSH hardening cannot run from an SSH session."
  }
  if (
    -not [string]::Equals(
      $env:SESSIONNAME,
      "Console",
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "OpenSSH hardening must run from the local Windows console."
  }

  $CurrentProcess = Get-Process -Id $PID
  if ($CurrentProcess.SessionId -eq 0) {
    throw "OpenSSH hardening cannot run from session 0."
  }
  if (-not [Environment]::Is64BitProcess) {
    throw "OpenSSH hardening requires 64-bit Windows PowerShell."
  }
}

function New-Sid {
  param([Parameter(Mandatory = $true)][string] $Value)

  return [Security.Principal.SecurityIdentifier]::new($Value)
}

function Assert-PathHasNoReparsePoint {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [switch] $AllowMissingLeaf
  )

  $FullPath = [IO.Path]::GetFullPath($Path)
  $PathRoot = [IO.Path]::GetPathRoot($FullPath)
  if ([string]::IsNullOrWhiteSpace($PathRoot)) {
    throw "A protected path is not fully qualified."
  }

  $Segments = @(
    $FullPath.Substring($PathRoot.Length).Split(
      [char[]] @("\", "/"),
      [StringSplitOptions]::RemoveEmptyEntries
    )
  )
  $CurrentPath = $PathRoot
  for ($Index = 0; $Index -lt $Segments.Count; $Index += 1) {
    $CurrentPath = Join-Path $CurrentPath $Segments[$Index]
    try {
      $Item = Get-Item -LiteralPath $CurrentPath -Force -ErrorAction Stop
    } catch [System.Management.Automation.ItemNotFoundException] {
      if (-not $AllowMissingLeaf) {
        throw "A protected path is missing."
      }
      break
    }

    if (
      ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      throw "A protected path contains a reparse point."
    }
    if ($Index -lt ($Segments.Count - 1) -and -not $Item.PSIsContainer) {
      throw "A protected path ancestor is not a directory."
    }
  }
}

function Assert-AdministrativePathAcl {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [switch] $Directory
  )

  Assert-PathHasNoReparsePoint -Path $Path
  $Item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if ([bool] $Item.PSIsContainer -ne [bool] $Directory) {
    throw "A protected state path has the wrong type."
  }

  $AdministratorsSid = New-Sid $AdministratorsSidValue
  $SystemSid = New-Sid $SystemSidValue
  $Acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
  $OwnerSid = $Acl.GetOwner(
    [Security.Principal.SecurityIdentifier]
  )
  if ($OwnerSid.Value -ne $AdministratorsSid.Value) {
    throw "A protected state path has an unexpected owner."
  }
  if (-not $Acl.AreAccessRulesProtected) {
    throw "A protected state path inherits access rules."
  }

  $Rules = @(
    $Acl.GetAccessRules(
      $true,
      $false,
      [Security.Principal.SecurityIdentifier]
    )
  )
  if ($Rules.Count -ne 2) {
    throw "A protected state path has an unexpected access rule."
  }

  $ExpectedInheritance = if ($Directory) {
    (
      [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
      [Security.AccessControl.InheritanceFlags]::ObjectInherit
    )
  } else {
    [Security.AccessControl.InheritanceFlags]::None
  }
  $ExpectedSids = @(
    $AdministratorsSid.Value,
    $SystemSid.Value
  )
  foreach ($Rule in $Rules) {
    if (
      $Rule.IdentityReference.Value -notin $ExpectedSids -or
      $Rule.AccessControlType -ne
        [Security.AccessControl.AccessControlType]::Allow -or
      $Rule.FileSystemRights -ne
        [Security.AccessControl.FileSystemRights]::FullControl -or
      $Rule.InheritanceFlags -ne $ExpectedInheritance -or
      $Rule.PropagationFlags -ne
        [Security.AccessControl.PropagationFlags]::None
    ) {
      throw "A protected state path has an unexpected access rule."
    }
  }
  if (@($Rules.IdentityReference.Value | Sort-Object -Unique).Count -ne 2) {
    throw "A protected state path is missing an administrative access rule."
  }
}

function Set-AdministrativeFileAcl {
  param([Parameter(Mandatory = $true)][string] $Path)

  Assert-PathHasNoReparsePoint -Path $Path
  $AdministratorsSid = New-Sid $AdministratorsSidValue
  $SystemSid = New-Sid $SystemSidValue
  $Acl = [Security.AccessControl.FileSecurity]::new()
  $Acl.SetAccessRuleProtection($true, $false)
  $Acl.SetOwner($AdministratorsSid)
  foreach ($Identity in @($AdministratorsSid, $SystemSid)) {
    $Acl.AddAccessRule(
      [Security.AccessControl.FileSystemAccessRule]::new(
        $Identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
      )
    )
  }

  Set-Acl -LiteralPath $Path -AclObject $Acl
  Assert-AdministrativePathAcl -Path $Path
}

function Set-AdministrativeDirectoryAcl {
  param([Parameter(Mandatory = $true)][string] $Path)

  Assert-PathHasNoReparsePoint -Path $Path
  $AdministratorsSid = New-Sid $AdministratorsSidValue
  $SystemSid = New-Sid $SystemSidValue
  $Acl = [Security.AccessControl.DirectorySecurity]::new()
  $Acl.SetAccessRuleProtection($true, $false)
  $Acl.SetOwner($AdministratorsSid)

  $Inheritance = (
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [Security.AccessControl.InheritanceFlags]::ObjectInherit
  )
  $Propagation = [Security.AccessControl.PropagationFlags]::None
  $Allow = [Security.AccessControl.AccessControlType]::Allow

  foreach ($Identity in @($AdministratorsSid, $SystemSid)) {
    $Acl.AddAccessRule(
      [Security.AccessControl.FileSystemAccessRule]::new(
        $Identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        $Inheritance,
        $Propagation,
        $Allow
      )
    )
  }

  Set-Acl -LiteralPath $Path -AclObject $Acl
  Assert-AdministrativePathAcl -Path $Path -Directory
}

function Get-StateRootMarkerContent {
  return "YTM Enhancer Windows QA OpenSSH hardening state v1`r`n"
}

function Assert-ProtectedStateTree {
  param([Parameter(Mandatory = $true)][string] $RootPath)

  Assert-AdministrativePathAcl -Path $RootPath -Directory
  $PendingDirectories = [Collections.Generic.Queue[string]]::new()
  $PendingDirectories.Enqueue($RootPath)
  while ($PendingDirectories.Count -gt 0) {
    $DirectoryPath = $PendingDirectories.Dequeue()
    foreach ($Item in @(
        Get-ChildItem -LiteralPath $DirectoryPath -Force -ErrorAction Stop
      )) {
      if (
        ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
      ) {
        throw "The protected state tree contains a reparse point."
      }
      if ($Item.PSIsContainer) {
        Assert-AdministrativePathAcl -Path $Item.FullName -Directory
        $PendingDirectories.Enqueue($Item.FullName)
      } else {
        Assert-AdministrativePathAcl -Path $Item.FullName
      }
    }
  }

  $MarkerPath = Join-Path $RootPath $StateRootMarkerName
  $LockPath = Join-Path $RootPath "transaction.lock"
  foreach ($RequiredPath in @($MarkerPath, $LockPath)) {
    if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
      throw "The protected state tree lacks tool provenance."
    }
  }
  $MarkerContent = [IO.File]::ReadAllText($MarkerPath)
  if (
    -not [string]::Equals(
      $MarkerContent,
      (Get-StateRootMarkerContent),
      [StringComparison]::Ordinal
    )
  ) {
    throw "The protected state tree lacks tool provenance."
  }
}

function Initialize-StateRoot {
  Assert-PathHasNoReparsePoint -Path $StateRoot -AllowMissingLeaf
  if (Test-Path -LiteralPath $StateRoot) {
    if (-not (Test-Path -LiteralPath $StateRoot -PathType Container)) {
      throw "The protected state root is not a directory."
    }
    Assert-ProtectedStateTree -RootPath $StateRoot
    return
  }

  $AdministratorsSid = New-Sid $AdministratorsSidValue
  $SystemSid = New-Sid $SystemSidValue
  $DirectoryAcl = [Security.AccessControl.DirectorySecurity]::new()
  $DirectoryAcl.SetAccessRuleProtection($true, $false)
  $DirectoryAcl.SetOwner($AdministratorsSid)
  $Inheritance = (
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [Security.AccessControl.InheritanceFlags]::ObjectInherit
  )
  foreach ($Identity in @($AdministratorsSid, $SystemSid)) {
    $DirectoryAcl.AddAccessRule(
      [Security.AccessControl.FileSystemAccessRule]::new(
        $Identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        $Inheritance,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow
      )
    )
  }

  $StateRootInfo = [IO.DirectoryInfo]::new($StateRoot)
  $StateRootInfo.Create($DirectoryAcl)
  Assert-PathHasNoReparsePoint -Path $StateRoot
  Assert-AdministrativePathAcl -Path $StateRoot -Directory
  if (
    @(Get-ChildItem -LiteralPath $StateRoot -Force -ErrorAction Stop).Count -ne
      0
  ) {
    Assert-ProtectedStateTree -RootPath $StateRoot
    throw "Another actor created the protected state root."
  }

  $Utf8NoBom = [Text.UTF8Encoding]::new($false)
  $MarkerPath = Join-Path $StateRoot $StateRootMarkerName
  $LockPath = Join-Path $StateRoot "transaction.lock"
  $MarkerBytes = $Utf8NoBom.GetBytes(
    (Get-StateRootMarkerContent)
  )
  $MarkerStream = [IO.File]::Open(
    $MarkerPath,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
  )
  try {
    $MarkerStream.Write($MarkerBytes, 0, $MarkerBytes.Length)
    $MarkerStream.Flush($true)
  } finally {
    $MarkerStream.Dispose()
  }
  $LockStream = [IO.File]::Open(
    $LockPath,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
  )
  $LockStream.Dispose()
  Set-AdministrativeFileAcl $MarkerPath
  Set-AdministrativeFileAcl $LockPath
  Assert-ProtectedStateTree -RootPath $StateRoot
}

function Get-SshdExecutable {
  $ExpectedPath = [IO.Path]::GetFullPath(
    (Join-Path $env:WINDIR "System32\OpenSSH\sshd.exe")
  )
  Assert-PathHasNoReparsePoint -Path $ExpectedPath
  if (-not (Test-Path -LiteralPath $ExpectedPath -PathType Leaf)) {
    throw "OpenSSH Server is not installed in its canonical location."
  }

  $Services = @(
    Get-CimInstance `
      -ClassName Win32_Service `
      -Filter "Name = 'sshd'" `
      -ErrorAction Stop
  )
  if ($Services.Count -ne 1) {
    throw "The registered OpenSSH Server service is not unique."
  }
  $Service = $Services[0]
  if (
    -not [string]::Equals(
      [string] $Service.Name,
      "sshd",
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not [string]::Equals(
      ([string] $Service.StartName).Trim(),
      "LocalSystem",
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "The registered OpenSSH Server service identity is not trusted."
  }

  $RegisteredCommand = ([string] $Service.PathName).Trim()
  if ([string]::IsNullOrWhiteSpace($RegisteredCommand)) {
    throw "The registered OpenSSH Server service command is unavailable."
  }
  if ($RegisteredCommand.StartsWith('"')) {
    $CommandMatch = [regex]::Match(
      $RegisteredCommand,
      '^"([^"]+)"$',
      [Text.RegularExpressions.RegexOptions]::CultureInvariant
    )
    if (-not $CommandMatch.Success) {
      throw "The registered OpenSSH Server service has unexpected arguments."
    }
    $RegisteredExecutable = $CommandMatch.Groups[1].Value
  } else {
    if ($RegisteredCommand -match '\s') {
      throw "The registered OpenSSH Server service has unexpected arguments."
    }
    $RegisteredExecutable = $RegisteredCommand
  }

  try {
    $RegisteredPath = [IO.Path]::GetFullPath($RegisteredExecutable)
  } catch {
    throw "The registered OpenSSH Server service path is invalid."
  }
  if (-not [string]::Equals(
      $RegisteredPath,
      $ExpectedPath,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "The registered OpenSSH Server service path is not canonical."
  }
  Assert-PathHasNoReparsePoint -Path $RegisteredPath

  return $ExpectedPath
}

function Get-QaContext {
  param([Parameter(Mandatory = $true)][string] $UserName)

  if ([string]::IsNullOrWhiteSpace($UserName)) {
    throw "-QaUser is required."
  }

  try {
    $User = Get-LocalUser -Name $UserName -ErrorAction Stop
  } catch {
    throw "The configured local QA account was not found."
  }

  $SidValue = $User.Sid.Value

  return [pscustomobject]@{
    User = $User
    Sid = $User.Sid
    SidValue = $SidValue
  }
}

function Get-LocalGroupByName {
  param([Parameter(Mandatory = $true)][string] $Name)

  return @(
    Get-LocalGroup -ErrorAction Stop |
      Where-Object {
        [string]::Equals(
          [string] $_.Name,
          $Name,
          [StringComparison]::OrdinalIgnoreCase
        )
      }
  )
}

function Get-AdministratorsGroup {
  $Group = Get-LocalGroup `
    -SID (New-Sid $AdministratorsSidValue) `
    -ErrorAction Stop
  if ($null -eq $Group) {
    throw "The built-in Administrators group could not be resolved."
  }

  return $Group
}

function Test-GroupContainsSid {
  param(
    [Parameter(Mandatory = $true)][string] $GroupName,
    [Parameter(Mandatory = $true)][string] $SidValue
  )

  $Members = @(
    Get-LocalGroupMember `
      -Group $GroupName `
      -ErrorAction Stop
  )
  return $null -ne (
    $Members |
      Where-Object { $_.SID.Value -eq $SidValue } |
      Select-Object -First 1
  )
}

function Test-QaIsAdministrator {
  param([Parameter(Mandatory = $true)] $QaContext)

  $Administrators = Get-AdministratorsGroup
  return Test-GroupContainsSid $Administrators.Name $QaContext.SidValue
}

function Assert-SeparateRecoveryAdministrator {
  param([Parameter(Mandatory = $true)] $QaContext)

  $CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  if ($CurrentIdentity.User.Value -eq $QaContext.SidValue) {
    throw "Use a separate local recovery administrator, not the QA account."
  }
  try {
    $LocalRecoveryUser = Get-LocalUser `
      -SID $CurrentIdentity.User `
      -ErrorAction Stop
  } catch {
    throw "Use a local recovery administrator, not a domain identity."
  }
}

function Assert-QaAccountLoggedOff {
  param([Parameter(Mandatory = $true)] $QaContext)

  $Processes = @(
    Get-CimInstance -ClassName Win32_Process -ErrorAction Stop
  )
  if ($Processes.Count -eq 0) {
    throw "The QA account process state could not be verified."
  }

  foreach ($Process in $Processes) {
    $Owner = Invoke-CimMethod `
      -InputObject $Process `
      -MethodName GetOwnerSid `
      -ErrorAction Stop
    if ($null -eq $Owner -or [int] $Owner.ReturnValue -ne 0) {
      throw "The QA account process state could not be verified."
    }
    try {
      $OwnerSid = New-Sid ([string] $Owner.Sid)
    } catch {
      throw "The QA account process state could not be verified."
    }
    if ($OwnerSid.Value -eq $QaContext.SidValue) {
      throw "Sign the QA account out completely before applying hardening."
    }
  }

  $LogonSessions = @(
    Get-CimInstance -ClassName Win32_LogonSession -ErrorAction Stop
  )
  if ($LogonSessions.Count -eq 0) {
    throw "The QA account session state could not be verified."
  }
  $InteractiveSessions = @(
    $LogonSessions |
      Where-Object { [int] $_.LogonType -in @(2, 10, 11) }
  )
  if ($InteractiveSessions.Count -eq 0) {
    throw "The QA account session state could not be verified."
  }

  foreach ($Session in $InteractiveSessions) {
    $Accounts = @(
      Get-CimAssociatedInstance `
        -InputObject $Session `
        -Association Win32_LoggedOnUser `
        -ResultClassName Win32_Account `
        -ErrorAction Stop
    )
    if ($Accounts.Count -eq 0) {
      throw "The QA account session state could not be verified."
    }
    foreach ($Account in $Accounts) {
      try {
        $AccountSid = New-Sid ([string] $Account.SID)
      } catch {
        throw "The QA account session state could not be verified."
      }
      if ($AccountSid.Value -eq $QaContext.SidValue) {
        throw "Sign the QA account out completely before applying hardening."
      }
    }
  }
}

function Assert-SshGroupName {
  param([Parameter(Mandatory = $true)][string] $GroupName)

  if ($GroupName -notmatch "^[A-Za-z0-9._-]+$") {
    throw "The SSH allow-group name may contain only letters, numbers, dot, underscore, and hyphen."
  }
}

function Ensure-SshGroup {
  param(
    [Parameter(Mandatory = $true)] $QaContext,
    [Parameter(Mandatory = $true)][string] $GroupName
  )

  $Groups = @(Get-LocalGroupByName $GroupName)
  if ($Groups.Count -gt 1) {
    throw "The SSH allow-group identity is ambiguous."
  }
  $Group = if ($Groups.Count -eq 1) {
    $Groups[0]
  } else {
    New-LocalGroup `
      -Name $GroupName `
      -Description "Standard users permitted to access Windows QA through SSH."
  }

  $Members = @(
    Get-LocalGroupMember `
      -Group $Group.Name `
      -ErrorAction Stop
  )
  $UnexpectedMembers = @(
    $Members | Where-Object { $_.SID.Value -ne $QaContext.SidValue }
  )
  if ($UnexpectedMembers.Count -gt 0) {
    throw "The SSH allow group contains an unexpected member."
  }

  if (-not (Test-GroupContainsSid $Group.Name $QaContext.SidValue)) {
    Add-LocalGroupMember -Group $Group.Name -Member $QaContext.User
  }
}

function Assert-SshGroupContainsOnlyQa {
  param(
    [Parameter(Mandatory = $true)][string] $GroupName,
    [Parameter(Mandatory = $true)][string] $QaSidValue
  )

  $Members = @(
    Get-LocalGroupMember `
      -Group $GroupName `
      -ErrorAction Stop
  )
  if (
    $Members.Count -ne 1 -or
    $Members[0].SID.Value -ne $QaSidValue
  ) {
    throw "The SSH allow group membership changed during hardening."
  }
}

function Set-FileAclFromSddl {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $Sddl
  )

  Assert-PathHasNoReparsePoint -Path $Path
  $Acl = [Security.AccessControl.FileSecurity]::new()
  $Acl.SetSecurityDescriptorSddlForm($Sddl)
  Set-Acl -LiteralPath $Path -AclObject $Acl
}

function Split-AuthorizedKeyLine {
  param([Parameter(Mandatory = $true)][string] $Line)

  $Tokens = [Collections.Generic.List[string]]::new()
  $Builder = [Text.StringBuilder]::new()
  $InQuotes = $false
  $Escaped = $false

  foreach ($Character in $Line.ToCharArray()) {
    if ($Escaped) {
      [void] $Builder.Append($Character)
      $Escaped = $false
      continue
    }
    if ($InQuotes -and $Character -eq "\") {
      [void] $Builder.Append($Character)
      $Escaped = $true
      continue
    }
    if ($Character -eq '"') {
      [void] $Builder.Append($Character)
      $InQuotes = -not $InQuotes
      continue
    }
    if ([char]::IsWhiteSpace($Character) -and -not $InQuotes) {
      if ($Builder.Length -gt 0) {
        $Tokens.Add($Builder.ToString())
        [void] $Builder.Clear()
      }
      continue
    }

    [void] $Builder.Append($Character)
  }

  if ($InQuotes -or $Escaped) {
    return @()
  }
  if ($Builder.Length -gt 0) {
    $Tokens.Add($Builder.ToString())
  }

  return @($Tokens)
}

function Test-SupportedPublicKeyType {
  param([Parameter(Mandatory = $true)][string] $Value)

  return $Value -match (
    "^(?:" +
    "ssh-(?:ed25519|rsa|dss)|" +
    "ecdsa-sha2-[A-Za-z0-9@._+-]+|" +
    "sk-ssh-ed25519@openssh\.com|" +
    "sk-ecdsa-sha2-nistp256@openssh\.com" +
    ")$"
  )
}

function Get-SinglePublicKeyLine {
  param([Parameter(Mandatory = $true)][string] $Path)

  Assert-PathHasNoReparsePoint -Path $Path
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "The public-key file was not found."
  }

  $KeyLines = @(
    Get-Content -LiteralPath $Path |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
  if ($KeyLines.Count -ne 1) {
    throw "The public-key file must contain exactly one nonempty line."
  }
  $Tokens = @(Split-AuthorizedKeyLine $KeyLines[0])
  if (
    $Tokens.Count -lt 2 -or
    -not (Test-SupportedPublicKeyType $Tokens[0]) -or
    $Tokens[1] -notmatch "^[A-Za-z0-9+/]+={0,3}$"
  ) {
    throw "The public-key file does not contain a supported OpenSSH public key."
  }

  return [string] $KeyLines[0]
}

function Add-AsciiLine {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $Line
  )

  Assert-PathHasNoReparsePoint -Path $Path -AllowMissingLeaf
  $FileExisted = Test-Path -LiteralPath $Path -PathType Leaf
  $OriginalBytes = [byte[]]::new(0)
  $OriginalSddl = ""
  if ($FileExisted) {
    $Item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($Item.Length -gt [int]::MaxValue) {
      throw "The authorized-key file is unexpectedly large."
    }
    $Stream = [IO.File]::Open(
      $Path,
      [IO.FileMode]::Open,
      [IO.FileAccess]::Read,
      [IO.FileShare]::None
    )
    try {
      $OriginalBytes = [byte[]]::new([int] $Stream.Length)
      $ReadOffset = 0
      while ($ReadOffset -lt $OriginalBytes.Length) {
        $ReadCount = $Stream.Read(
          $OriginalBytes,
          $ReadOffset,
          $OriginalBytes.Length - $ReadOffset
        )
        if ($ReadCount -le 0) {
          throw "The authorized-key file could not be read completely."
        }
        $ReadOffset += $ReadCount
      }
      $OriginalSddl = (Get-Acl -LiteralPath $Path).Sddl
    } finally {
      $Stream.Dispose()
    }
  }

  $Output = [IO.MemoryStream]::new()
  try {
    if ($OriginalBytes.Length -gt 0) {
      $Output.Write($OriginalBytes, 0, $OriginalBytes.Length)
    }
    if (
      $OriginalBytes.Length -gt 0 -and
      $OriginalBytes[-1] -notin @(10, 13)
    ) {
      $Separator = [Text.Encoding]::ASCII.GetBytes("`r`n")
      $Output.Write($Separator, 0, $Separator.Length)
    }
    $LineBytes = [Text.Encoding]::ASCII.GetBytes("$Line`r`n")
    $Output.Write($LineBytes, 0, $LineBytes.Length)
  } finally {
    $OutputBytes = $Output.ToArray()
    $Output.Dispose()
  }

  $TemporaryPath = "$Path.ytme-" + [guid]::NewGuid().ToString("N")
  try {
    [IO.File]::WriteAllBytes($TemporaryPath, $OutputBytes)
    if ($FileExisted) {
      Set-FileAclFromSddl -Path $TemporaryPath -Sddl $OriginalSddl
    }
    Assert-PathHasNoReparsePoint -Path $Path -AllowMissingLeaf
    Replace-FileAtomically `
      -SourcePath $TemporaryPath `
      -DestinationPath $Path `
      -AllowMissingDestination
  } finally {
    Remove-Item `
      -LiteralPath $TemporaryPath `
      -Force `
      -ErrorAction SilentlyContinue
  }
}

function Install-ProtectedAuthorizedKey {
  param(
    [Parameter(Mandatory = $true)][string] $SourcePath,
    [Parameter(Mandatory = $true)][string] $DestinationPath
  )

  $KeyLine = Get-SinglePublicKeyLine $SourcePath
  $CanonicalKey = Get-CanonicalPublicKey $KeyLine
  if ([string]::IsNullOrWhiteSpace($CanonicalKey)) {
    throw "The public key is invalid."
  }

  $FullDestinationPath = [IO.Path]::GetFullPath($DestinationPath)
  $TemporaryPath = (
    "$FullDestinationPath.ytme-" +
    [guid]::NewGuid().ToString("N")
  )
  try {
    Assert-PathHasNoReparsePoint `
      -Path $FullDestinationPath `
      -AllowMissingLeaf
    $Ascii = [Text.Encoding]::ASCII
    [IO.File]::WriteAllText(
      $TemporaryPath,
      "$CanonicalKey`r`n",
      $Ascii
    )
    Set-AdministrativeFileAcl $TemporaryPath
    $StagedSha256 = (
      Get-FileHash -LiteralPath $TemporaryPath -Algorithm SHA256
    ).Hash
    Replace-FileAtomically `
      -SourcePath $TemporaryPath `
      -DestinationPath $FullDestinationPath `
      -AllowMissingDestination
    $InstalledSha256 = (
      Get-FileHash -LiteralPath $FullDestinationPath -Algorithm SHA256
    ).Hash
    if (-not [string]::Equals(
        $InstalledSha256,
        $StagedSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "The protected authorized-key file failed integrity validation."
    }
    Assert-AdministrativePathAcl -Path $FullDestinationPath
  } finally {
    Remove-Item `
      -LiteralPath $TemporaryPath `
      -Force `
      -ErrorAction SilentlyContinue
  }

  return $FullDestinationPath
}

function Assert-ProtectedAuthorizedKey {
  param(
    [Parameter(Mandatory = $true)] $State,
    [Parameter(Mandatory = $true)][string] $StateDirectory
  )

  $ExpectedPath = [IO.Path]::GetFullPath(
    (Join-Path $StateDirectory "authorized_keys")
  )
  $ActualPath = [IO.Path]::GetFullPath(
    [string] $State.protectedAuthorizedKeysPath
  )
  if (-not [string]::Equals(
      $ActualPath,
      $ExpectedPath,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "The protected authorized-key path is outside transaction state."
  }
  Assert-AdministrativePathAcl -Path $ActualPath
  Get-SinglePublicKeyLine $ActualPath | Out-Null
}

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

function Get-AutoDisableSshRules {
  return @(
    Get-SshPortRules |
      Where-Object {
        (Test-RuleIsAutoDisableSshRule $_) -and
        [string] $_.Direction -eq "Inbound" -and
        [string] $_.Action -eq "Allow"
      }
  )
}

function ConvertTo-SortedFirewallStrings {
  param($Value)

  return @(
    @($Value) |
      ForEach-Object { [string] $_ } |
      Sort-Object -CaseSensitive
  )
}

function Get-FirewallRuleIdentitySnapshot {
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
  $InterfaceFilters = @(
    $Rule |
      Get-NetFirewallInterfaceFilter -ErrorAction Stop
  )
  $InterfaceTypeFilters = @(
    $Rule |
      Get-NetFirewallInterfaceTypeFilter -ErrorAction Stop
  )
  $SecurityFilters = @(
    $Rule |
      Get-NetFirewallSecurityFilter -ErrorAction Stop
  )

  $RuleCore = [ordered]@{
    name = [string] $Rule.Name
    ruleInstanceId = [string] $Rule.InstanceID
    policyStoreSource = [string] $Rule.PolicyStoreSource
    policyStoreSourceType = [string] $Rule.PolicyStoreSourceType
    direction = [string] $Rule.Direction
    action = [string] $Rule.Action
    profile = [string] $Rule.Profile
    edgeTraversalPolicy = [string] $Rule.EdgeTraversalPolicy
    looseSourceMapping = [string] $Rule.LooseSourceMapping
    localOnlyMapping = [string] $Rule.LocalOnlyMapping
    owner = [string] $Rule.Owner
    packageFamilyName = [string] $Rule.PackageFamilyName
    policyAppId = [string] $Rule.PolicyAppId
    remoteDynamicKeywordAddresses = @(
      ConvertTo-SortedFirewallStrings `
        $Rule.RemoteDynamicKeywordAddresses
    )
    platform = @(
      ConvertTo-SortedFirewallStrings $Rule.Platform
    )
  }
  $PortFilterSignatures = @(
    $PortFilters |
      ForEach-Object {
        $Signature = [ordered]@{
          instanceId = [string] $_.InstanceID
          protocol = [string] $_.Protocol
          localPort = @(
            ConvertTo-SortedFirewallStrings $_.LocalPort
          )
          remotePort = @(
            ConvertTo-SortedFirewallStrings $_.RemotePort
          )
          icmpType = @(
            ConvertTo-SortedFirewallStrings $_.IcmpType
          )
          dynamicTarget = [string] $_.DynamicTarget
        }
        [pscustomobject] $Signature |
          ConvertTo-Json -Compress -Depth 4
      } |
      Sort-Object -CaseSensitive
  )
  $ServiceFilterSignatures = @(
    $ServiceFilters |
      ForEach-Object {
        $Signature = [ordered]@{
          instanceId = [string] $_.InstanceID
          service = [string] $_.Service
        }
        [pscustomobject] $Signature |
          ConvertTo-Json -Compress -Depth 4
      } |
      Sort-Object -CaseSensitive
  )
  $ApplicationFilterSignatures = @(
    $ApplicationFilters |
      ForEach-Object {
        $Signature = [ordered]@{
          instanceId = [string] $_.InstanceID
          program = [string] $_.Program
          appPath = [string] $_.AppPath
          package = [string] $_.Package
        }
        [pscustomobject] $Signature |
          ConvertTo-Json -Compress -Depth 4
      } |
      Sort-Object -CaseSensitive
  )
  $AddressFilterSignatures = @(
    $AddressFilters |
      ForEach-Object {
        $Signature = [ordered]@{
          instanceId = [string] $_.InstanceID
          localAddress = @(
            ConvertTo-SortedFirewallStrings $_.LocalAddress
          )
          remoteAddress = @(
            ConvertTo-SortedFirewallStrings $_.RemoteAddress
          )
        }
        [pscustomobject] $Signature |
          ConvertTo-Json -Compress -Depth 4
      } |
      Sort-Object -CaseSensitive
  )
  $InterfaceFilterSignatures = @(
    $InterfaceFilters |
      ForEach-Object {
        $Signature = [ordered]@{
          instanceId = [string] $_.InstanceID
          interfaceAlias = @(
            ConvertTo-SortedFirewallStrings $_.InterfaceAlias
          )
        }
        [pscustomobject] $Signature |
          ConvertTo-Json -Compress -Depth 4
      } |
      Sort-Object -CaseSensitive
  )
  $InterfaceTypeFilterSignatures = @(
    $InterfaceTypeFilters |
      ForEach-Object {
        $Signature = [ordered]@{
          instanceId = [string] $_.InstanceID
          interfaceType = @(
            ConvertTo-SortedFirewallStrings $_.InterfaceType
          )
        }
        [pscustomobject] $Signature |
          ConvertTo-Json -Compress -Depth 4
      } |
      Sort-Object -CaseSensitive
  )
  $SecurityFilterSignatures = @(
    $SecurityFilters |
      ForEach-Object {
        $Signature = [ordered]@{
          instanceId = [string] $_.InstanceID
          authentication = [string] $_.Authentication
          encryption = [string] $_.Encryption
          overrideBlockRules = [string] $_.OverrideBlockRules
          localUser = @(
            ConvertTo-SortedFirewallStrings $_.LocalUser
          )
          remoteUser = @(
            ConvertTo-SortedFirewallStrings $_.RemoteUser
          )
          remoteMachine = @(
            ConvertTo-SortedFirewallStrings $_.RemoteMachine
          )
        }
        [pscustomobject] $Signature |
          ConvertTo-Json -Compress -Depth 4
      } |
      Sort-Object -CaseSensitive
  )

  return [pscustomobject]@{
    enabled = [string] $Rule.Enabled
    ruleInstanceId = [string] $Rule.InstanceID
    ruleCoreSignature = (
      [pscustomobject] $RuleCore |
        ConvertTo-Json -Compress -Depth 4
    )
    portFilterInstanceIds = @(
      ConvertTo-SortedFirewallStrings $PortFilters.InstanceID
    )
    portFilterSignatures = $PortFilterSignatures
    serviceFilterInstanceIds = @(
      ConvertTo-SortedFirewallStrings $ServiceFilters.InstanceID
    )
    serviceFilterSignatures = $ServiceFilterSignatures
    applicationFilterInstanceIds = @(
      ConvertTo-SortedFirewallStrings $ApplicationFilters.InstanceID
    )
    applicationFilterSignatures = $ApplicationFilterSignatures
    addressFilterInstanceIds = @(
      ConvertTo-SortedFirewallStrings $AddressFilters.InstanceID
    )
    addressFilterSignatures = $AddressFilterSignatures
    interfaceFilterInstanceIds = @(
      ConvertTo-SortedFirewallStrings $InterfaceFilters.InstanceID
    )
    interfaceFilterSignatures = $InterfaceFilterSignatures
    interfaceTypeFilterInstanceIds = @(
      ConvertTo-SortedFirewallStrings `
        $InterfaceTypeFilters.InstanceID
    )
    interfaceTypeFilterSignatures = $InterfaceTypeFilterSignatures
    securityFilterInstanceIds = @(
      ConvertTo-SortedFirewallStrings $SecurityFilters.InstanceID
    )
    securityFilterSignatures = $SecurityFilterSignatures
  }
}

function Test-StringArraysEqual {
  param(
    $First,
    $Second
  )

  $FirstValues = @($First)
  $SecondValues = @($Second)
  if ($FirstValues.Count -ne $SecondValues.Count) {
    return $false
  }
  for ($Index = 0; $Index -lt $FirstValues.Count; $Index += 1) {
    if (-not [string]::Equals(
        [string] $FirstValues[$Index],
        [string] $SecondValues[$Index],
        [StringComparison]::Ordinal
      )) {
      return $false
    }
  }

  return $true
}

function Test-FirewallRuleMatchesSnapshot {
  param(
    [Parameter(Mandatory = $true)] $Rule,
    [Parameter(Mandatory = $true)] $Snapshot,
    [Parameter(Mandatory = $true)][string[]] $AllowedEnabled
  )

  $EnabledMatches = $false
  foreach ($ExpectedEnabled in $AllowedEnabled) {
    if ([string]::Equals(
        [string] $Rule.Enabled,
        $ExpectedEnabled,
        [StringComparison]::Ordinal
      )) {
      $EnabledMatches = $true
      break
    }
  }
  if (-not $EnabledMatches) {
    return $false
  }

  $Current = Get-FirewallRuleIdentitySnapshot $Rule
  foreach ($PropertyName in @(
      "ruleInstanceId",
      "ruleCoreSignature",
      "portFilterInstanceIds",
      "portFilterSignatures",
      "serviceFilterInstanceIds",
      "serviceFilterSignatures",
      "applicationFilterInstanceIds",
      "applicationFilterSignatures",
      "addressFilterInstanceIds",
      "addressFilterSignatures",
      "interfaceFilterInstanceIds",
      "interfaceFilterSignatures",
      "interfaceTypeFilterInstanceIds",
      "interfaceTypeFilterSignatures",
      "securityFilterInstanceIds",
      "securityFilterSignatures"
    )) {
    if (-not (
        Test-StringArraysEqual `
          $Current.$PropertyName `
          $Snapshot.$PropertyName
      )) {
      return $false
    }
  }

  return $true
}

function Assert-FirewallRuleMatchesSnapshot {
  param(
    [Parameter(Mandatory = $true)] $RuleState,
    [Parameter(Mandatory = $true)][string[]] $AllowedEnabled
  )

  $Rules = @(Get-ActiveFirewallRulesByName $RuleState.name)
  if ($Rules.Count -ne 1) {
    throw "An earlier SSH firewall rule changed during the transaction."
  }

  $Rule = $Rules[0]
  if (-not (
      Test-FirewallRuleMatchesSnapshot `
        -Rule $Rule `
        -Snapshot $RuleState.identitySnapshot `
        -AllowedEnabled $AllowedEnabled
    )) {
    throw "An earlier SSH firewall rule changed during the transaction."
  }

  return $Rule
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

function Assert-RemoteAddress {
  param([Parameter(Mandatory = $true)][string[]] $Addresses)

  if ($Addresses.Count -eq 0) {
    throw "At least one restricted firewall remote address is required."
  }
  $UnsafeKeywords = @(
    "defaultgateway",
    "dhcp",
    "dns",
    "internet",
    "intranet",
    "playtodevice",
    "wins"
  )
  foreach ($Address in $Addresses) {
    if ([string]::IsNullOrWhiteSpace($Address)) {
      throw "The hardened firewall rule requires an explicitly limited source."
    }
    $Normalized = $Address.Trim().ToLowerInvariant()
    if (
      (Test-RemoteAddressIsUniversal $Address) -or
      $Normalized -in $UnsafeKeywords
    ) {
      throw "The hardened firewall rule requires an explicitly limited source."
    }
  }
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

function New-RestrictedFirewallRule {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $RemoteAddress
  )

  $ExistingRules = @(Get-ActiveFirewallRulesByName $RestrictedFirewallRuleName)
  if ($ExistingRules.Count -gt 0) {
    throw "A previous hardened firewall rule already exists. Audit or roll it back first."
  }

  New-NetFirewallRule `
    -Name $RestrictedFirewallRuleName `
    -DisplayName "YTM Enhancer Windows QA OpenSSH" `
    -Description "Key-only Windows QA SSH from approved private sources." `
    -Enabled True `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 22 `
    -Service sshd `
    -Action Allow `
    -Profile Private `
    -RemoteAddress $RemoteAddress `
    -EdgeTraversalPolicy Block |
    Out-Null
}

function Get-SshdPrincipal {
  param([Parameter(Mandatory = $true)][string] $Name)

  $Normalized = $Name.ToLowerInvariant()
  if ($Normalized -match "\s") {
    return '"' + $Normalized.Replace('"', '\"') + '"'
  }

  return $Normalized
}

function Write-CandidateConfig {
  param(
    [Parameter(Mandatory = $true)][string] $DestinationPath,
    [Parameter(Mandatory = $true)][string] $AllowGroup,
    [Parameter(Mandatory = $true)][string] $DenyGroup,
    [Parameter(Mandatory = $true)][string] $AuthorizedKeysPath
  )

  if (
    -not [IO.Path]::IsPathRooted($AuthorizedKeysPath) -or
    $AuthorizedKeysPath.Contains("`r") -or
    $AuthorizedKeysPath.Contains("`n") -or
    $AuthorizedKeysPath.Contains('"')
  ) {
    throw "The protected authorized-key path is invalid."
  }
  $AuthorizedKeysPath = [IO.Path]::GetFullPath($AuthorizedKeysPath)
  $AuthorizedKeysDirectivePath = $AuthorizedKeysPath.Replace("\", "/")
  $Original = [IO.File]::ReadAllText($ConfigPath)
  $ManagedPattern = (
    "(?ms)^" +
    [regex]::Escape($ManagedBlockStart) +
    "\r?\n.*?^" +
    [regex]::Escape($ManagedBlockEnd) +
    "\r?\n?"
  )
  $OriginalWithoutManagedBlock = [regex]::Replace(
    $Original,
    $ManagedPattern,
    ""
  ).TrimStart()

  $HardeningBlock = @"
$ManagedBlockStart
PubkeyAuthentication yes
AuthenticationMethods publickey
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
AuthorizedKeysFile "$AuthorizedKeysDirectivePath"
AllowGroups $(Get-SshdPrincipal $AllowGroup)
DenyGroups $(Get-SshdPrincipal $DenyGroup)
DisableForwarding yes
AllowAgentForwarding no
AllowTcpForwarding no
AllowStreamLocalForwarding no
GatewayPorts no
PermitTunnel no
X11Forwarding no
$ManagedBlockEnd
"@

  $Utf8NoBom = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText(
    $DestinationPath,
    "$HardeningBlock`r`n`r`n$OriginalWithoutManagedBlock",
    $Utf8NoBom
  )
  Set-AdministrativeFileAcl $DestinationPath
}

function Invoke-SshdSyntaxCheck {
  param(
    [Parameter(Mandatory = $true)][string] $SshdExecutable,
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $OutputDirectory
  )

  $ErrorPath = Join-Path $OutputDirectory "sshd-syntax-error.log"
  Remove-Item -LiteralPath $ErrorPath -Force -ErrorAction SilentlyContinue
  $Process = Start-Process `
    -FilePath $SshdExecutable `
    -ArgumentList "-t", "-f", "`"$Path`"" `
    -RedirectStandardError $ErrorPath `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  if (Test-Path -LiteralPath $ErrorPath -PathType Leaf) {
    Set-AdministrativeFileAcl $ErrorPath
  }
  if ($Process.ExitCode -ne 0) {
    throw "OpenSSH rejected the candidate configuration."
  }
}

function Get-EffectiveSshdConfig {
  param(
    [Parameter(Mandatory = $true)][string] $SshdExecutable,
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $OutputDirectory,
    [Parameter(Mandatory = $true)][string] $UserName
  )

  $OutputPath = Join-Path $OutputDirectory "sshd-effective.log"
  $ErrorPath = Join-Path $OutputDirectory "sshd-effective-error.log"
  Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ErrorPath -Force -ErrorAction SilentlyContinue

  $Process = Start-Process `
    -FilePath $SshdExecutable `
    -ArgumentList `
      "-T", `
      "-f", `
      "`"$Path`"", `
      "-C", `
      "user=$UserName,host=localhost,addr=127.0.0.1" `
    -RedirectStandardOutput $OutputPath `
    -RedirectStandardError $ErrorPath `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  foreach ($LogPath in @($OutputPath, $ErrorPath)) {
    if (Test-Path -LiteralPath $LogPath -PathType Leaf) {
      Set-AdministrativeFileAcl $LogPath
    }
  }
  if ($Process.ExitCode -ne 0) {
    throw "OpenSSH could not resolve the effective configuration."
  }

  return [IO.File]::ReadAllText($OutputPath).ToLowerInvariant()
}

function Assert-EffectiveSshdConfig {
  param(
    [Parameter(Mandatory = $true)][string] $EffectiveConfig,
    [Parameter(Mandatory = $true)][string] $AllowGroup,
    [Parameter(Mandatory = $true)][string] $DenyGroup,
    [Parameter(Mandatory = $true)][string] $ExpectedAuthorizedKeysPath
  )

  $RequiredValues = @(
    "pubkeyauthentication yes",
    "authenticationmethods publickey",
    "passwordauthentication no",
    "kbdinteractiveauthentication no",
    "permitemptypasswords no",
    "disableforwarding yes",
    "allowagentforwarding no",
    "allowtcpforwarding no",
    "allowstreamlocalforwarding no",
    "gatewayports no",
    "permittunnel no",
    "x11forwarding no"
  )

  foreach ($RequiredValue in $RequiredValues) {
    if ($EffectiveConfig -notmatch (
      "(?m)^" + [regex]::Escape($RequiredValue) + "\s*$"
    )) {
      throw "The effective OpenSSH configuration is not fully hardened."
    }
  }

  foreach ($GroupPolicy in @(
    @{
      directive = "allowgroups"
      group = $AllowGroup.ToLowerInvariant()
    },
    @{
      directive = "denygroups"
      group = $DenyGroup.ToLowerInvariant()
    }
  )) {
    $GroupPattern = (
      "(?m)^" +
      $GroupPolicy.directive +
      "\s+`"?" +
      [regex]::Escape($GroupPolicy.group) +
      "`"?\s*$"
    )
    if ($EffectiveConfig -notmatch $GroupPattern) {
      throw "The effective OpenSSH group policy is not hardened."
    }
  }

  $AuthorizedKeysLines = @(
    $EffectiveConfig -split "\r?\n" |
      Where-Object { $_ -match "^authorizedkeysfile\s+" }
  )
  if ($AuthorizedKeysLines.Count -ne 1) {
    throw "OpenSSH is not using the protected authorized-key file."
  }
  $ActualAuthorizedKeysPath = (
    $AuthorizedKeysLines[0] -replace "^authorizedkeysfile\s+", ""
  ).Trim().Trim('"').Replace("\", "/").TrimEnd("/")
  $ExpectedAuthorizedKeysPath = (
    [IO.Path]::GetFullPath($ExpectedAuthorizedKeysPath)
  ).Replace("\", "/").TrimEnd("/")
  if (-not [string]::Equals(
      $ActualAuthorizedKeysPath,
      $ExpectedAuthorizedKeysPath,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "OpenSSH is not using the protected authorized-key file."
  }
}

function Enter-StateLock {
  param(
    [Parameter(Mandatory = $true)][string] $StateDirectory,
    [ValidateRange(0, 600)]
    [int] $TimeoutSeconds = 30
  )

  Assert-PathHasNoReparsePoint -Path $StateRoot
  Assert-PathHasNoReparsePoint -Path $StateDirectory
  # Every hardening state changes the same OpenSSH, firewall, group, and key
  # resources, so the lock must be global rather than scoped to one state ID.
  $LockPath = Join-Path $StateRoot "transaction.lock"
  Assert-AdministrativePathAcl -Path $LockPath
  $Stopwatch = [Diagnostics.Stopwatch]::StartNew()
  while (
    $TimeoutSeconds -eq 0 -or
    $Stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds
  ) {
    try {
      return [IO.File]::Open(
        $LockPath,
        [IO.FileMode]::OpenOrCreate,
        [IO.FileAccess]::ReadWrite,
        [IO.FileShare]::None
      )
    } catch [IO.IOException] {
      Start-Sleep -Milliseconds 100
    }
  }

  throw "Another OpenSSH hardening phase is still active."
}

function Replace-FileAtomically {
  param(
    [Parameter(Mandatory = $true)][string] $SourcePath,
    [Parameter(Mandatory = $true)][string] $DestinationPath,
    [switch] $AllowMissingDestination
  )

  $SourceFullPath = [IO.Path]::GetFullPath($SourcePath)
  $DestinationFullPath = [IO.Path]::GetFullPath($DestinationPath)
  $SourceDirectory = [IO.Path]::GetDirectoryName($SourceFullPath)
  $DestinationDirectory = [IO.Path]::GetDirectoryName($DestinationFullPath)
  if (-not [string]::Equals(
      $SourceDirectory,
      $DestinationDirectory,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Atomic file replacement requires same-directory staging."
  }
  Assert-PathHasNoReparsePoint -Path $SourceFullPath
  Assert-PathHasNoReparsePoint `
    -Path $DestinationFullPath `
    -AllowMissingLeaf
  if (-not (Test-Path -LiteralPath $SourceFullPath -PathType Leaf)) {
    throw "The atomic replacement source is missing."
  }

  $DisplacedPath = (
    "$DestinationFullPath.ytme-replace-backup-" +
    [guid]::NewGuid().ToString("N")
  )
  try {
    if (Test-Path -LiteralPath $DestinationFullPath -PathType Leaf) {
      [IO.File]::Replace(
        $SourceFullPath,
        $DestinationFullPath,
        $DisplacedPath
      )
      return
    }
    if (-not $AllowMissingDestination) {
      throw "The atomic replacement destination is missing."
    }
    if (Test-Path -LiteralPath $DestinationFullPath) {
      throw "The atomic replacement destination is not a file."
    }

    [IO.File]::Move($SourceFullPath, $DestinationFullPath)
  } finally {
    Remove-Item `
      -LiteralPath $SourceFullPath `
      -Force `
      -ErrorAction SilentlyContinue
    Remove-Item `
      -LiteralPath $DisplacedPath `
      -Force `
      -ErrorAction SilentlyContinue
  }
}

function Save-State {
  param(
    [Parameter(Mandatory = $true)] $State,
    [Parameter(Mandatory = $true)][string] $StateDirectory
  )

  Assert-PathHasNoReparsePoint -Path $StateDirectory
  $StatePath = Join-Path $StateDirectory "state.json"
  $TemporaryPath = Join-Path `
    $StateDirectory `
    ("state-" + [guid]::NewGuid().ToString("N") + ".tmp")
  $Json = $State | ConvertTo-Json -Depth 10
  $Utf8NoBom = [Text.UTF8Encoding]::new($false)
  $ProtectStateFile = Test-Path `
    -LiteralPath (Join-Path $StateRoot ".ytme-openssh-hardening-root") `
    -PathType Leaf
  try {
    [IO.File]::WriteAllText($TemporaryPath, $Json, $Utf8NoBom)
    if ($ProtectStateFile) {
      Set-AdministrativeFileAcl $TemporaryPath
    }
    Replace-FileAtomically `
      -SourcePath $TemporaryPath `
      -DestinationPath $StatePath `
      -AllowMissingDestination
    if ($ProtectStateFile) {
      Set-AdministrativeFileAcl $StatePath
    }
  } finally {
    Remove-Item `
      -LiteralPath $TemporaryPath `
      -Force `
      -ErrorAction SilentlyContinue
  }
}

function Set-CurrentStateId {
  param([Parameter(Mandatory = $true)][string] $Value)

  Assert-PathHasNoReparsePoint -Path $StateRoot
  $CurrentStatePath = Join-Path $StateRoot "current-state.txt"
  $TemporaryPath = Join-Path `
    $StateRoot `
    ("current-state-" + [guid]::NewGuid().ToString("N") + ".tmp")
  $Utf8NoBom = [Text.UTF8Encoding]::new($false)
  $ProtectStateFile = Test-Path `
    -LiteralPath (Join-Path $StateRoot ".ytme-openssh-hardening-root") `
    -PathType Leaf
  try {
    [IO.File]::WriteAllText($TemporaryPath, $Value, $Utf8NoBom)
    if ($ProtectStateFile) {
      Set-AdministrativeFileAcl $TemporaryPath
    }
    Replace-FileAtomically `
      -SourcePath $TemporaryPath `
      -DestinationPath $CurrentStatePath `
      -AllowMissingDestination
    if ($ProtectStateFile) {
      Set-AdministrativeFileAcl $CurrentStatePath
    }
  } finally {
    Remove-Item `
      -LiteralPath $TemporaryPath `
      -Force `
      -ErrorAction SilentlyContinue
  }
}

function Resolve-StateDirectory {
  Assert-PathHasNoReparsePoint -Path $StateRoot -AllowMissingLeaf
  if (-not (Test-Path -LiteralPath $StateRoot -PathType Container)) {
    throw "No protected OpenSSH hardening state was found."
  }
  Assert-ProtectedStateTree -RootPath $StateRoot

  $ResolvedStateId = $StateId
  if ([string]::IsNullOrWhiteSpace($ResolvedStateId)) {
    $CurrentStatePath = Join-Path $StateRoot "current-state.txt"
    if (-not (Test-Path -LiteralPath $CurrentStatePath -PathType Leaf)) {
      throw "No prepared OpenSSH hardening state was found."
    }
    $ResolvedStateId = [IO.File]::ReadAllText($CurrentStatePath).Trim()
  }

  if ($ResolvedStateId -notmatch "^\d{14}-[a-f0-9]{8}$") {
    throw "The OpenSSH hardening state identifier is invalid."
  }

  $StateDirectory = Join-Path $StateRoot $ResolvedStateId
  Assert-PathHasNoReparsePoint -Path $StateDirectory -AllowMissingLeaf
  if (-not (Test-Path -LiteralPath $StateDirectory -PathType Container)) {
    throw "The requested OpenSSH hardening state was not found."
  }

  return $StateDirectory
}

function Load-State {
  param([Parameter(Mandatory = $true)][string] $StateDirectory)

  Assert-PathHasNoReparsePoint -Path $StateDirectory
  $StatePath = Join-Path $StateDirectory "state.json"
  Assert-PathHasNoReparsePoint -Path $StatePath -AllowMissingLeaf
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
    throw "The OpenSSH hardening state is incomplete."
  }

  return Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
}

function Test-StateTransactionActive {
  param([Parameter(Mandatory = $true)] $State)

  if ([bool] $State.committed) {
    return $false
  }

  return (
    [bool] $State.preparePending -or
    [bool] $State.prepared -or
    [bool] $State.applied -or
    [bool] $State.firewallFinalized -or
    [bool] $State.commitPending -or
    [bool] $State.qaAccountDisablePending -or
    [bool] $State.qaAccountDisabled -or
    [bool] $State.rollbackPending -or
    [bool] $State.rollbackFailed
  )
}

function Assert-ConfigUnchangedSincePrepare {
  param([Parameter(Mandatory = $true)] $State)

  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "The OpenSSH configuration changed after Prepare."
  }
  $CurrentSha256 = (
    Get-FileHash -LiteralPath $ConfigPath -Algorithm SHA256
  ).Hash
  if (-not [string]::Equals(
      $CurrentSha256,
      [string] $State.configSha256,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "The OpenSSH configuration changed after Prepare."
  }
}

function Assert-StateIsCurrent {
  param([Parameter(Mandatory = $true)] $State)

  $CurrentStatePath = Join-Path $StateRoot "current-state.txt"
  Assert-PathHasNoReparsePoint -Path $CurrentStatePath -AllowMissingLeaf
  if (-not (Test-Path -LiteralPath $CurrentStatePath -PathType Leaf)) {
    throw "The OpenSSH hardening transaction is not the current state."
  }
  $CurrentStateId = [IO.File]::ReadAllText($CurrentStatePath).Trim()
  if ($CurrentStateId -ne [string] $State.id) {
    throw "The OpenSSH hardening transaction is not the current state."
  }
}

function Assert-NoActiveHardeningTransaction {
  $CurrentStatePath = Join-Path $StateRoot "current-state.txt"
  Assert-PathHasNoReparsePoint -Path $CurrentStatePath -AllowMissingLeaf
  if (-not (Test-Path -LiteralPath $CurrentStatePath -PathType Leaf)) {
    return
  }

  $CurrentStateId = [IO.File]::ReadAllText($CurrentStatePath).Trim()
  if ($CurrentStateId -notmatch "^\d{14}-[a-f0-9]{8}$") {
    throw "The existing OpenSSH hardening state is invalid."
  }
  $CurrentStateDirectory = Join-Path $StateRoot $CurrentStateId
  $CurrentState = Load-State $CurrentStateDirectory
  $RollbackTask = Get-ScheduledTask `
    -TaskName $CurrentState.rollbackTaskName `
    -ErrorAction SilentlyContinue
  if (
    (Test-StateTransactionActive $CurrentState) -or
    $null -ne $RollbackTask
  ) {
    throw "Resolve the existing OpenSSH hardening transaction first."
  }
}

function ConvertFrom-ScheduledTaskDuration {
  param(
    [Parameter(Mandatory = $true)] $Value,
    [Parameter(Mandatory = $true)][string] $Description
  )

  if ($Value -is [TimeSpan]) {
    return [TimeSpan] $Value
  }
  try {
    return [Xml.XmlConvert]::ToTimeSpan([string] $Value)
  } catch {
    throw "The automatic rollback task $Description is invalid."
  }
}

function Assert-RollbackTaskRegistered {
  param(
    [Parameter(Mandatory = $true)][string] $TaskName,
    [Parameter(Mandatory = $true)][string] $ExpectedExecutable,
    [Parameter(Mandatory = $true)][string] $ExpectedArguments,
    [Parameter(Mandatory = $true)][datetime] $ExpectedTriggerAt
  )

  $Tasks = @(
    Get-ScheduledTask `
      -TaskName $TaskName `
      -ErrorAction Stop
  )
  if ($Tasks.Count -ne 1) {
    throw "The automatic rollback task is not uniquely registered."
  }
  $Task = $Tasks[0]
  $Actions = @($Task.Actions)
  if ($Actions.Count -ne 1) {
    throw "The automatic rollback task action is not trusted."
  }
  try {
    $ActualExecutable = [IO.Path]::GetFullPath(
      [string] $Actions[0].Execute
    )
  } catch {
    throw "The automatic rollback task action is not trusted."
  }
  if (
    -not [string]::Equals(
      $ActualExecutable,
      $ExpectedExecutable,
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not [string]::Equals(
      [string] $Actions[0].Arguments,
      $ExpectedArguments,
      [StringComparison]::Ordinal
    )
  ) {
    throw "The automatic rollback task action is not trusted."
  }

  $Principal = $Task.Principal
  $PrincipalUser = ([string] $Principal.UserId).Trim()
  if (
    $PrincipalUser -notin @(
      "SYSTEM",
      "NT AUTHORITY\SYSTEM",
      $SystemSidValue
    ) -or
    -not [string]::Equals(
      [string] $Principal.LogonType,
      "ServiceAccount",
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not [string]::Equals(
      [string] $Principal.RunLevel,
      "Highest",
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "The automatic rollback task principal is not trusted."
  }

  $Settings = $Task.Settings
  if (-not [string]::Equals(
      ([string] $Settings.Enabled).Trim(),
      "True",
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "The automatic rollback task is disabled."
  }

  $Triggers = @($Task.Triggers)
  if ($Triggers.Count -ne 1) {
    throw "The automatic rollback task trigger is not trusted."
  }
  $Trigger = $Triggers[0]
  if (
    -not [string]::Equals(
      ([string] $Trigger.Enabled).Trim(),
      "True",
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not [string]::Equals(
      [string] $Trigger.CimClass.CimClassName,
      "MSFT_TaskTimeTrigger",
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "The automatic rollback task trigger is not trusted."
  }
  $ActualTriggerAt = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse(
      [string] $Trigger.StartBoundary,
      [Globalization.CultureInfo]::InvariantCulture,
      (
        [Globalization.DateTimeStyles]::AssumeLocal -bor
        [Globalization.DateTimeStyles]::AllowWhiteSpaces
      ),
      [ref] $ActualTriggerAt
    )) {
    throw "The automatic rollback task trigger time is invalid."
  }
  $ExpectedTriggerOffset = [DateTimeOffset]::new($ExpectedTriggerAt)
  $TriggerTimeDifference = (
    $ActualTriggerAt.ToUniversalTime() -
    $ExpectedTriggerOffset.ToUniversalTime()
  ).Duration()
  if ($TriggerTimeDifference -gt (New-TimeSpan -Seconds 2)) {
    throw "The automatic rollback task trigger time is not trusted."
  }

  $ExecutionTimeLimit = ConvertFrom-ScheduledTaskDuration `
    -Value $Settings.ExecutionTimeLimit `
    -Description "execution limit"
  $RestartInterval = ConvertFrom-ScheduledTaskDuration `
    -Value $Settings.RestartInterval `
    -Description "restart interval"
  if (
    -not [bool] $Settings.StartWhenAvailable -or
    [bool] $Settings.DisallowStartIfOnBatteries -or
    [bool] $Settings.StopIfGoingOnBatteries -or
    $ExecutionTimeLimit -ne (New-TimeSpan -Minutes 5) -or
    [int] $Settings.RestartCount -ne 3 -or
    $RestartInterval -ne (New-TimeSpan -Minutes 1)
  ) {
    throw "The automatic rollback task settings are not fail-safe."
  }
}

function Register-Rollback {
  param(
    [Parameter(Mandatory = $true)] $State,
    [Parameter(Mandatory = $true)][string] $StateDirectory
  )

  $RollbackToolPath = Join-Path $StateDirectory "harden-openssh.ps1"
  $SourceToolPath = [IO.Path]::GetFullPath($PSCommandPath)
  $ProtectedToolPath = [IO.Path]::GetFullPath($RollbackToolPath)
  $SourceSha256 = (
    Get-FileHash -LiteralPath $SourceToolPath -Algorithm SHA256
  ).Hash
  if (
    -not [string]::Equals(
      $SourceToolPath,
      $ProtectedToolPath,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    $TemporaryToolPath = Join-Path `
      $StateDirectory `
      ("harden-openssh-" + [guid]::NewGuid().ToString("N") + ".tmp")
    try {
      Copy-Item `
        -LiteralPath $SourceToolPath `
        -Destination $TemporaryToolPath `
        -ErrorAction Stop
      $StagedSha256 = (
        Get-FileHash -LiteralPath $TemporaryToolPath -Algorithm SHA256
      ).Hash
      $CurrentSourceSha256 = (
        Get-FileHash -LiteralPath $SourceToolPath -Algorithm SHA256
      ).Hash
      if (
        -not [string]::Equals(
          $StagedSha256,
          $SourceSha256,
          [StringComparison]::OrdinalIgnoreCase
        ) -or
        -not [string]::Equals(
          $CurrentSourceSha256,
          $SourceSha256,
          [StringComparison]::OrdinalIgnoreCase
        )
      ) {
        throw "The rollback helper changed while it was staged."
      }
      Set-AdministrativeFileAcl $TemporaryToolPath
      Replace-FileAtomically `
        -SourcePath $TemporaryToolPath `
        -DestinationPath $ProtectedToolPath `
        -AllowMissingDestination
    } finally {
      Remove-Item `
        -LiteralPath $TemporaryToolPath `
        -Force `
        -ErrorAction SilentlyContinue
    }
  }
  $ProtectedSha256 = (
    Get-FileHash -LiteralPath $ProtectedToolPath -Algorithm SHA256
  ).Hash
  if (-not [string]::Equals(
      $ProtectedSha256,
      $SourceSha256,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "The protected rollback helper failed integrity validation."
  }
  Set-AdministrativeFileAcl $ProtectedToolPath
  Assert-AdministrativePathAcl -Path $ProtectedToolPath

  $Arguments = (
    "-NoProfile -ExecutionPolicy Bypass " +
    "-File `"$RollbackToolPath`" " +
    "-Mode Rollback " +
    "-StateId `"$($State.id)`" " +
    "-FromScheduledTask"
  )
  $PowerShellExecutable = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $PowerShellExecutable = [IO.Path]::GetFullPath($PowerShellExecutable)
  Assert-PathHasNoReparsePoint -Path $PowerShellExecutable
  if (-not (
      Test-Path `
        -LiteralPath $PowerShellExecutable `
        -PathType Leaf
    )) {
    throw "The system Windows PowerShell executable is unavailable."
  }
  $Action = New-ScheduledTaskAction `
    -Execute $PowerShellExecutable `
    -Argument $Arguments
  $TriggerAt = (Get-Date).AddMinutes($RollbackMinutes)
  $Trigger = New-ScheduledTaskTrigger `
    -Once `
    -At $TriggerAt
  $Principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest
  $Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask `
    -TaskName $State.rollbackTaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings `
    -Force |
    Out-Null
  Assert-RollbackTaskRegistered `
    -TaskName $State.rollbackTaskName `
    -ExpectedExecutable $PowerShellExecutable `
    -ExpectedArguments $Arguments `
    -ExpectedTriggerAt $TriggerAt
}

function Unregister-Rollback {
  param(
    [Parameter(Mandatory = $true)] $State,
    [switch] $AllowMissing
  )

  $ExistingTask = Get-ScheduledTask `
    -TaskName $State.rollbackTaskName `
    -ErrorAction SilentlyContinue
  if ($null -eq $ExistingTask) {
    if ($AllowMissing) {
      return
    }
    throw "The automatic rollback task is not registered."
  }

  Unregister-ScheduledTask `
    -TaskName $State.rollbackTaskName `
    -Confirm:$false
  if (Get-ScheduledTask `
      -TaskName $State.rollbackTaskName `
      -ErrorAction SilentlyContinue) {
    throw "The automatic rollback task could not be cancelled."
  }
}

function Restore-OriginalFirewallRules {
  param([Parameter(Mandatory = $true)] $State)

  $Failed = $false
  if (
    [bool] $State.restrictedFirewallRulePending -or
    [bool] $State.restrictedFirewallRuleCreated
  ) {
    try {
      $RestrictedRules = @(
        Get-ActiveFirewallRulesByName $RestrictedFirewallRuleName
      )
      if ($RestrictedRules.Count -gt 1) {
        throw "The managed firewall rule identity is ambiguous."
      }
      if ($RestrictedRules.Count -eq 1) {
        $RestrictedRule = $RestrictedRules[0]
        if (-not (
            Test-ManagedFirewallRule `
              -Rule $RestrictedRule `
              -ExpectedAddresses @($State.restrictedRemoteAddresses)
            )) {
          throw "The managed firewall rule changed during the transaction."
        }
        Remove-NetFirewallRule -InputObject $RestrictedRule -ErrorAction Stop
      }
    } catch {
      $Failed = $true
    }
  }

  if ([bool] $State.previousFirewallRulesModified) {
    foreach ($RuleState in @($State.originalFirewallRules)) {
      try {
        $AllowedEnabled = @("False")
        if (([string] $RuleState.enabled) -eq "True") {
          $AllowedEnabled += "True"
        }
        $Rule = Assert-FirewallRuleMatchesSnapshot `
          -RuleState $RuleState `
          -AllowedEnabled $AllowedEnabled

        if (([string] $Rule.Enabled) -eq ([string] $RuleState.enabled)) {
          continue
        }
        if (([string] $RuleState.enabled) -eq "True") {
          Enable-NetFirewallRule -InputObject $Rule -ErrorAction Stop
        } else {
          Disable-NetFirewallRule -InputObject $Rule -ErrorAction Stop
        }
      } catch {
        $Failed = $true
      }
    }
  }

  if ($Failed) {
    throw "One or more firewall recovery actions failed."
  }
}

function Restore-SshGroup {
  param([Parameter(Mandatory = $true)] $State)

  $Groups = @(Get-LocalGroupByName $State.sshGroup)
  if ($Groups.Count -gt 1) {
    throw "The SSH allow-group identity is ambiguous during rollback."
  }
  if ($Groups.Count -eq 0) {
    return
  }
  $Group = $Groups[0]

  if (
    [bool] $State.sshGroupMemberAdded -and
    (Test-GroupContainsSid $Group.Name $State.qaSid)
  ) {
    Remove-LocalGroupMember `
      -Group $Group.Name `
      -Member (New-Sid $State.qaSid) `
      -Confirm:$false `
      -ErrorAction Stop
  }

  if ([bool] $State.sshGroupCreated) {
    $RemainingMembers = @(
      Get-LocalGroupMember `
        -Group $Group.Name `
        -ErrorAction Stop
    )
    if ($RemainingMembers.Count -eq 0) {
      Remove-LocalGroup -Name $Group.Name -ErrorAction Stop
    }
  }
}

function Get-MatchingAuthorizedKeySegmentsBase64 {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $PublicKeyLine
  )

  Assert-PathHasNoReparsePoint -Path $Path
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "The authorized-key file was not found."
  }

  $CanonicalKey = Get-CanonicalPublicKey $PublicKeyLine
  if ([string]::IsNullOrWhiteSpace($CanonicalKey)) {
    throw "The public key is invalid."
  }
  $InputBytes = [IO.File]::ReadAllBytes($Path)
  $Utf8 = [Text.UTF8Encoding]::new($false, $false)
  $Matches = [Collections.Generic.List[string]]::new()
  $LineStart = 0

  for ($Index = 0; $Index -lt $InputBytes.Length; $Index += 1) {
    if ($InputBytes[$Index] -ne 10) {
      continue
    }

    $ContentLength = $Index - $LineStart
    if (
      $ContentLength -gt 0 -and
      $InputBytes[$Index - 1] -eq 13
    ) {
      $ContentLength -= 1
    }
    $Line = $Utf8.GetString($InputBytes, $LineStart, $ContentLength)
    if ((Get-CanonicalPublicKey $Line) -eq $CanonicalKey) {
      $SegmentLength = $Index - $LineStart + 1
      $Segment = [byte[]]::new($SegmentLength)
      [Buffer]::BlockCopy(
        $InputBytes,
        $LineStart,
        $Segment,
        0,
        $SegmentLength
      )
      $Matches.Add([Convert]::ToBase64String($Segment))
    }
    $LineStart = $Index + 1
  }

  if ($LineStart -lt $InputBytes.Length) {
    $ContentLength = $InputBytes.Length - $LineStart
    $Line = $Utf8.GetString($InputBytes, $LineStart, $ContentLength)
    if ((Get-CanonicalPublicKey $Line) -eq $CanonicalKey) {
      $Segment = [byte[]]::new($ContentLength)
      [Buffer]::BlockCopy(
        $InputBytes,
        $LineStart,
        $Segment,
        0,
        $ContentLength
      )
      $Matches.Add([Convert]::ToBase64String($Segment))
    }
  }

  return $Matches.ToArray()
}

function Get-OriginalAdministratorKeySegmentsBase64 {
  param(
    [Parameter(Mandatory = $true)] $State,
    [Parameter(Mandatory = $true)][string] $StateDirectory
  )

  $ExpectedBackupPath = [IO.Path]::GetFullPath(
    (Join-Path $StateDirectory "administrators_authorized_keys.original")
  )
  $ActualBackupPath = [IO.Path]::GetFullPath(
    [string] $State.administratorKeyBackupPath
  )
  if (-not [string]::Equals(
      $ActualBackupPath,
      $ExpectedBackupPath,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "The administrator authorized-key backup is outside transaction state."
  }

  Assert-PathHasNoReparsePoint -Path $ActualBackupPath
  if (-not (Test-Path -LiteralPath $ActualBackupPath -PathType Leaf)) {
    throw "The administrator authorized-key backup is missing."
  }
  Assert-AdministrativePathAcl -Path $ActualBackupPath
  $BackupSha256 = (
    Get-FileHash -LiteralPath $ActualBackupPath -Algorithm SHA256
  ).Hash
  if (-not [string]::Equals(
      $BackupSha256,
      [string] $State.administratorKeyBackupSha256,
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw "The administrator authorized-key backup failed integrity validation."
  }

  $QaKeyLine = Get-SinglePublicKeyLine `
    $State.protectedAuthorizedKeysPath
  $Segments = @(
    Get-MatchingAuthorizedKeySegmentsBase64 `
      -Path $ActualBackupPath `
      -PublicKeyLine $QaKeyLine
  )
  if ($Segments.Count -eq 0) {
    throw "The original administrator key line is missing from backup."
  }

  return $Segments
}

function Restore-AdministratorAuthorizedKeys {
  param(
    [Parameter(Mandatory = $true)] $State,
    [Parameter(Mandatory = $true)][string] $StateDirectory
  )

  if (-not [bool] $State.administratorKeyModified) {
    return
  }

  if (
    -not [bool] $State.administratorKeyExisted -or
    -not [bool] $State.administratorKeyContainedQaKey
  ) {
    throw "Administrator authorized-key recovery state is invalid."
  }

  try {
    $QaKeyLine = Get-SinglePublicKeyLine `
      $State.protectedAuthorizedKeysPath
    $QaKey = Get-CanonicalPublicKey $QaKeyLine
    $OriginalSegments = @(
      Get-OriginalAdministratorKeySegmentsBase64 `
        -State $State `
        -StateDirectory $StateDirectory
    )

    $AdministratorKeyPath = [IO.Path]::GetFullPath(
      [string] $State.administratorKeyPath
    )
    Assert-PathHasNoReparsePoint `
      -Path $AdministratorKeyPath `
      -AllowMissingLeaf
    if (
      (Test-Path -LiteralPath $AdministratorKeyPath) -and
      -not (
        Test-Path `
          -LiteralPath $AdministratorKeyPath `
          -PathType Leaf
      )
    ) {
      throw "The administrator authorized-key path is not a file."
    }

    $CurrentBytes = if (
      Test-Path -LiteralPath $AdministratorKeyPath -PathType Leaf
    ) {
      [IO.File]::ReadAllBytes($AdministratorKeyPath)
    } else {
      [byte[]]::new(0)
    }
    $Output = [IO.MemoryStream]::new()
    $Utf8 = [Text.UTF8Encoding]::new($false, $false)
    $LineStart = 0
    try {
      for ($Index = 0; $Index -lt $CurrentBytes.Length; $Index += 1) {
        if ($CurrentBytes[$Index] -ne 10) {
          continue
        }

        $ContentLength = $Index - $LineStart
        if (
          $ContentLength -gt 0 -and
          $CurrentBytes[$Index - 1] -eq 13
        ) {
          $ContentLength -= 1
        }
        $Line = $Utf8.GetString(
          $CurrentBytes,
          $LineStart,
          $ContentLength
        )
        if ((Get-CanonicalPublicKey $Line) -ne $QaKey) {
          $SegmentLength = $Index - $LineStart + 1
          $Output.Write(
            $CurrentBytes,
            $LineStart,
            $SegmentLength
          )
        }
        $LineStart = $Index + 1
      }

      if ($LineStart -lt $CurrentBytes.Length) {
        $ContentLength = $CurrentBytes.Length - $LineStart
        $Line = $Utf8.GetString(
          $CurrentBytes,
          $LineStart,
          $ContentLength
        )
        if ((Get-CanonicalPublicKey $Line) -ne $QaKey) {
          $Output.Write(
            $CurrentBytes,
            $LineStart,
            $ContentLength
          )
        }
      }

      $FilteredBytes = $Output.ToArray()
      if (
        $FilteredBytes.Length -gt 0 -and
        $FilteredBytes[-1] -notin @(10, 13)
      ) {
        $Separator = [Text.Encoding]::ASCII.GetBytes("`r`n")
        $Output.Write($Separator, 0, $Separator.Length)
      }
      foreach ($SegmentBase64 in $OriginalSegments) {
        $SegmentBytes = [Convert]::FromBase64String(
          [string] $SegmentBase64
        )
        $Output.Write($SegmentBytes, 0, $SegmentBytes.Length)
      }

      $TemporaryPath = (
        "$AdministratorKeyPath.ytme-" +
        [guid]::NewGuid().ToString("N")
      )
      try {
        $LiveSddl = if (
          Test-Path -LiteralPath $AdministratorKeyPath -PathType Leaf
        ) {
          (Get-Acl -LiteralPath $AdministratorKeyPath).Sddl
        } else {
          [string] $State.administratorKeySddl
        }
        if ([string]::IsNullOrWhiteSpace($LiveSddl)) {
          throw "The administrator authorized-key ACL is unavailable."
        }
        [IO.File]::WriteAllBytes($TemporaryPath, $Output.ToArray())
        Set-FileAclFromSddl -Path $TemporaryPath -Sddl $LiveSddl
        Replace-FileAtomically `
          -SourcePath $TemporaryPath `
          -DestinationPath $AdministratorKeyPath `
          -AllowMissingDestination
      } finally {
        Remove-Item `
          -LiteralPath $TemporaryPath `
          -Force `
          -ErrorAction SilentlyContinue
      }
    } finally {
      $Output.Dispose()
    }

    $RestoredSegments = @(
      Get-MatchingAuthorizedKeySegmentsBase64 `
        -Path $AdministratorKeyPath `
        -PublicKeyLine $QaKeyLine
    )
    if ($RestoredSegments.Count -ne $OriginalSegments.Count) {
      throw "The administrator key could not be restored exactly."
    }
    for ($Index = 0; $Index -lt $OriginalSegments.Count; $Index += 1) {
      if (-not [string]::Equals(
          [string] $RestoredSegments[$Index],
          [string] $OriginalSegments[$Index],
          [StringComparison]::Ordinal
        )) {
        throw "The administrator key could not be restored exactly."
      }
    }
  } catch {
    throw "Administrator authorized-key recovery failed."
  }
}

function Get-CanonicalPublicKey {
  param([Parameter(Mandatory = $true)][string] $Line)

  $Tokens = @(Split-AuthorizedKeyLine $Line.TrimStart([char] 0xFEFF))
  for ($Index = 0; $Index -lt ($Tokens.Count - 1); $Index += 1) {
    if (
      (Test-SupportedPublicKeyType $Tokens[$Index]) -and
      $Tokens[$Index + 1] -match "^[A-Za-z0-9+/]+={0,3}$"
    ) {
      return "$($Tokens[$Index]) $($Tokens[$Index + 1])"
    }
  }

  return ""
}

function Test-FileContainsCanonicalPublicKey {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $PublicKeyLine
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }

  $CanonicalKey = Get-CanonicalPublicKey $PublicKeyLine
  foreach ($Line in @(Get-Content -LiteralPath $Path)) {
    if ((Get-CanonicalPublicKey $Line) -eq $CanonicalKey) {
      return $true
    }
  }

  return $false
}

function Remove-QaKeyFromAdministratorAuthorizedKeys {
  param(
    [Parameter(Mandatory = $true)] $State,
    [Parameter(Mandatory = $true)][string] $StateDirectory
  )

  if (
    -not (
      Test-Path `
        -LiteralPath $State.administratorKeyPath `
        -PathType Leaf
    )
  ) {
    return $false
  }

  $QaKeyLine = Get-SinglePublicKeyLine `
    $State.protectedAuthorizedKeysPath
  $QaKey = Get-CanonicalPublicKey $QaKeyLine
  Get-OriginalAdministratorKeySegmentsBase64 `
    -State $State `
    -StateDirectory $StateDirectory |
    Out-Null

  if (
    -not (
      Test-FileContainsCanonicalPublicKey `
        -Path $State.administratorKeyPath `
        -PublicKeyLine $QaKeyLine
    )
  ) {
    return [bool] $State.administratorKeyModified
  }

  if (-not [bool] $State.administratorKeyModified) {
    $State.administratorKeyModified = $true
    Save-State $State $StateDirectory
  }

  $InputBytes = [IO.File]::ReadAllBytes($State.administratorKeyPath)
  $Output = [IO.MemoryStream]::new()
  $Utf8 = [Text.UTF8Encoding]::new($false, $false)
  $RemovedCount = 0
  $LineStart = 0

  try {
    for ($Index = 0; $Index -lt $InputBytes.Length; $Index += 1) {
      if ($InputBytes[$Index] -ne 10) {
        continue
      }

      $ContentLength = $Index - $LineStart
      if (
        $ContentLength -gt 0 -and
        $InputBytes[$Index - 1] -eq 13
      ) {
        $ContentLength -= 1
      }
      $Line = $Utf8.GetString($InputBytes, $LineStart, $ContentLength)
      if ((Get-CanonicalPublicKey $Line) -eq $QaKey) {
        $RemovedCount += 1
      } else {
        $SegmentLength = $Index - $LineStart + 1
        $Output.Write($InputBytes, $LineStart, $SegmentLength)
      }
      $LineStart = $Index + 1
    }

    if ($LineStart -lt $InputBytes.Length) {
      $ContentLength = $InputBytes.Length - $LineStart
      $Line = $Utf8.GetString($InputBytes, $LineStart, $ContentLength)
      if ((Get-CanonicalPublicKey $Line) -eq $QaKey) {
        $RemovedCount += 1
      } else {
        $Output.Write($InputBytes, $LineStart, $ContentLength)
      }
    }

    if ($RemovedCount -eq 0) {
      return $false
    }

    $TemporaryPath = (
      "$($State.administratorKeyPath).ytme-" +
      [guid]::NewGuid().ToString("N")
    )
    try {
      $OriginalSddl = (
        Get-Acl -LiteralPath $State.administratorKeyPath
      ).Sddl
      [IO.File]::WriteAllBytes($TemporaryPath, $Output.ToArray())
      Set-FileAclFromSddl -Path $TemporaryPath -Sddl $OriginalSddl
      Replace-FileAtomically `
        -SourcePath $TemporaryPath `
        -DestinationPath $State.administratorKeyPath
    } finally {
      Remove-Item `
        -LiteralPath $TemporaryPath `
        -Force `
        -ErrorAction SilentlyContinue
    }
  } finally {
    $Output.Dispose()
  }

  if (
    Test-FileContainsCanonicalPublicKey `
      -Path $State.administratorKeyPath `
      -PublicKeyLine $QaKeyLine
  ) {
    throw "The QA key could not be removed from the administrator key file."
  }

  return $true
}

function Restore-AdministratorMembership {
  param([Parameter(Mandatory = $true)] $State)

  if (
    -not [bool] $State.qaWasAdministrator -or
    -not [bool] $State.administratorMembershipModified
  ) {
    return
  }

  $QaUser = Get-LocalUser `
    -SID (New-Sid $State.qaSid) `
    -ErrorAction Stop
  if ($null -eq $QaUser) {
    throw "The original QA account could not be resolved by SID."
  }
  $Administrators = Get-AdministratorsGroup
  if (-not (Test-GroupContainsSid $Administrators.Name $State.qaSid)) {
    Add-LocalGroupMember `
      -Group $Administrators.Name `
      -Member $QaUser
  }
}

function Restore-QaAccountEnabledState {
  param([Parameter(Mandatory = $true)] $State)

  if (
    -not [bool] $State.qaAccountDisablePending -and
    -not [bool] $State.qaAccountDisabled
  ) {
    return
  }
  if (
    $State.PSObject.Properties.Name -notcontains
      "qaAccountWasEnabled"
  ) {
    throw "The original QA account enabled state is unavailable."
  }

  $QaUser = Get-LocalUser `
    -SID (New-Sid $State.qaSid) `
    -ErrorAction Stop
  if ($null -eq $QaUser) {
    throw "The original QA account could not be resolved by SID."
  }
  $ShouldBeEnabled = [bool] $State.qaAccountWasEnabled
  if ($ShouldBeEnabled -and -not [bool] $QaUser.Enabled) {
    Enable-LocalUser -InputObject $QaUser -ErrorAction Stop
  } elseif (-not $ShouldBeEnabled -and [bool] $QaUser.Enabled) {
    Disable-LocalUser -InputObject $QaUser -ErrorAction Stop
  }

  $RestoredUser = Get-LocalUser `
    -SID (New-Sid $State.qaSid) `
    -ErrorAction Stop
  if (
    $null -eq $RestoredUser -or
    [bool] $RestoredUser.Enabled -ne $ShouldBeEnabled
  ) {
    throw "The QA account enabled state could not be restored."
  }
}

function Install-SshdConfiguration {
  param(
    [Parameter(Mandatory = $true)][string] $CandidatePath,
    [Parameter(Mandatory = $true)] $State
  )

  $TemporaryPath = (
    "$ConfigPath.ytme-staged-" +
    [guid]::NewGuid().ToString("N")
  )
  try {
    if (-not (Test-Path -LiteralPath $CandidatePath -PathType Leaf)) {
      throw "The candidate OpenSSH configuration is missing."
    }
    $CandidateSha256 = (
      Get-FileHash -LiteralPath $CandidatePath -Algorithm SHA256
    ).Hash
    Copy-Item `
      -LiteralPath $CandidatePath `
      -Destination $TemporaryPath `
      -Force `
      -ErrorAction Stop
    $StagedSha256 = (
      Get-FileHash -LiteralPath $TemporaryPath -Algorithm SHA256
    ).Hash
    if (-not [string]::Equals(
        $StagedSha256,
        $CandidateSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "The staged OpenSSH configuration failed integrity validation."
    }
    Set-FileAclFromSddl `
      -Path $TemporaryPath `
      -Sddl $State.configSddl
    Assert-ConfigUnchangedSincePrepare $State
    Replace-FileAtomically `
      -SourcePath $TemporaryPath `
      -DestinationPath $ConfigPath
  } catch {
    throw "OpenSSH configuration activation failed."
  } finally {
    Remove-Item `
      -LiteralPath $TemporaryPath `
      -Force `
      -ErrorAction SilentlyContinue
  }
}

function Restore-SshdConfiguration {
  param([Parameter(Mandatory = $true)] $State)

  if (-not [bool] $State.configModified) {
    return
  }

  $TemporaryPath = "$ConfigPath.ytme-rollback-$([guid]::NewGuid().ToString("N"))"
  try {
    if (-not (
        Test-Path `
          -LiteralPath $State.configBackupPath `
          -PathType Leaf
      )) {
      throw "The configuration backup is missing."
    }
    $BackupSha256 = (
      Get-FileHash `
        -LiteralPath $State.configBackupPath `
        -Algorithm SHA256
    ).Hash
    if (-not [string]::Equals(
        $BackupSha256,
        [string] $State.configSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "The configuration backup failed integrity validation."
    }
    Copy-Item `
      -LiteralPath $State.configBackupPath `
      -Destination $TemporaryPath `
      -Force `
      -ErrorAction Stop
    $StagedSha256 = (
      Get-FileHash `
        -LiteralPath $TemporaryPath `
        -Algorithm SHA256
    ).Hash
    if (-not [string]::Equals(
        $StagedSha256,
        [string] $State.configSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "The staged configuration failed integrity validation."
    }
    Set-FileAclFromSddl `
      -Path $TemporaryPath `
      -Sddl $State.configSddl
    Replace-FileAtomically `
      -SourcePath $TemporaryPath `
      -DestinationPath $ConfigPath `
      -AllowMissingDestination
  } catch {
    throw "OpenSSH configuration recovery failed."
  } finally {
    Remove-Item `
      -LiteralPath $TemporaryPath `
      -Force `
      -ErrorAction SilentlyContinue
  }
}

function Invoke-StateRollback {
  param(
    [Parameter(Mandatory = $true)] $State,
    [Parameter(Mandatory = $true)][string] $StateDirectory
  )

  $RollbackErrors = [Collections.Generic.List[string]]::new()
  $Steps = @(
    @{
      name = "configuration"
      action = { Restore-SshdConfiguration $State }
    },
    @{
      name = "firewall"
      action = { Restore-OriginalFirewallRules $State }
    },
    @{
      name = "administrator keys"
      action = {
        Restore-AdministratorAuthorizedKeys $State $StateDirectory
      }
    },
    @{
      name = "administrator membership"
      action = { Restore-AdministratorMembership $State }
    },
    @{
      name = "QA account enabled state"
      action = { Restore-QaAccountEnabledState $State }
    },
    @{
      name = "SSH allow group"
      action = { Restore-SshGroup $State }
    }
  )
  if ([bool] $State.configModified) {
    $Steps += @{
      name = "sshd restart"
      action = { Restart-Service sshd -Force }
    }
  }

  foreach ($Step in $Steps) {
    try {
      & $Step.action
    } catch {
      $RollbackErrors.Add([string] $Step["name"])
    }
  }

  if ($RollbackErrors.Count -gt 0) {
    $State.rollbackFailed = $true
    $State.rollbackFailureCount = $RollbackErrors.Count
    try {
      Save-State $State $StateDirectory
    } catch {
      $RollbackErrors.Add("state update")
    }
    try {
      Register-Rollback $State $StateDirectory
    } catch {
      $RollbackErrors.Add("rollback rearm")
    }
    throw "Rollback attempted every recovery step, but one or more steps failed."
  }

  $State.rollbackPending = $true
  try {
    Save-State $State $StateDirectory
  } catch {
    try {
      Register-Rollback $State $StateDirectory
    } catch {
      # Keep the original state-write failure as the public result.
    }
    throw "Rollback restored live state but could not record task cleanup."
  }

  try {
    Unregister-Rollback $State -AllowMissing
  } catch {
    $State.rollbackFailed = $true
    $State.rollbackFailureCount = 1
    try {
      Save-State $State $StateDirectory
    } catch {
      # The protected prior state remains available.
    }
    try {
      Register-Rollback $State $StateDirectory
    } catch {
      # Report one generic recovery failure below.
    }
    throw "Rollback restored live state but could not cancel its recovery task."
  }

  $State.prepared = $false
  $State.preparePending = $false
  $State.applied = $false
  $State.firewallFinalized = $false
  $State.commitPending = $false
  $State.committed = $false
  $State.qaAccountDisablePending = $false
  $State.qaAccountDisabled = $false
  $State.rollbackPending = $false
  $State.rollbackFailed = $false
  $State.rollbackFailureCount = 0
  try {
    Save-State $State $StateDirectory
  } catch {
    try {
      Register-Rollback $State $StateDirectory
    } catch {
      # The local recovery administrator still has the protected backups.
    }
    throw "Rollback restored live state but could not finalize its record."
  }
}

function Disable-PreviousFirewallRules {
  param([Parameter(Mandatory = $true)] $State)

  $Failed = $false
  foreach ($RuleState in @($State.originalFirewallRules)) {
    try {
      $Rule = Assert-FirewallRuleMatchesSnapshot `
        -RuleState $RuleState `
        -AllowedEnabled @([string] $RuleState.enabled)
      if (Test-RuleIsEnabledInboundAllow $Rule) {
        Disable-NetFirewallRule -InputObject $Rule -ErrorAction Stop
      }
    } catch {
      $Failed = $true
    }
  }

  if ($Failed) {
    throw "One or more earlier SSH firewall rules could not be disabled."
  }
}

function Get-EnabledPreviousFirewallRuleCount {
  param([Parameter(Mandatory = $true)] $State)

  $Count = 0
  foreach ($RuleState in @($State.originalFirewallRules)) {
    $ExpectedEnabled = if ([bool] $State.previousFirewallRulesModified) {
      "False"
    } else {
      [string] $RuleState.enabled
    }
    $Rule = Assert-FirewallRuleMatchesSnapshot `
      -RuleState $RuleState `
      -AllowedEnabled @($ExpectedEnabled)
    if (Test-RuleIsEnabledInboundAllow $Rule) {
      $Count += 1
    }
  }

  return $Count
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

function Invoke-Audit {
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

function Invoke-Prepare {
  Assert-IsAdministrator
  Assert-LocalRecoveryConsole
  Assert-SshGroupName $SshGroup
  Assert-RemoteAddress $RemoteAddress
  if ([string]::IsNullOrWhiteSpace($PublicKeyPath)) {
    throw "-PublicKeyPath is required for Prepare."
  }
  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "The OpenSSH server configuration was not found."
  }
  $QaContext = Get-QaContext $QaUser
  if (-not [bool] $QaContext.User.Enabled) {
    throw "The configured QA account must be enabled before Prepare."
  }
  Assert-QaAccountLoggedOff $QaContext
  Assert-SeparateRecoveryAdministrator $QaContext
  if ((Get-EnabledGenericSshCoveringRuleCount) -gt 0) {
    throw "A broad firewall rule covering SSH requires manual review."
  }
  if (
    @(Get-ActiveFirewallRulesByName $RestrictedFirewallRuleName).Count -gt 0
  ) {
    throw "A previous hardened firewall rule already exists."
  }

  Initialize-StateRoot
  $StateLock = Enter-StateLock $StateRoot
  try {
  Assert-NoActiveHardeningTransaction
  if ((Get-EnabledGenericSshCoveringRuleCount) -gt 0) {
    throw "A broad firewall rule covering SSH requires manual review."
  }
  if (
    @(Get-ActiveFirewallRulesByName $RestrictedFirewallRuleName).Count -gt 0
  ) {
    throw "A previous hardened firewall rule already exists."
  }
  $Administrators = Get-AdministratorsGroup
  $SshdExecutable = Get-SshdExecutable
  $GeneratedStateId = (
    (Get-Date -Format "yyyyMMddHHmmss") +
    "-" +
    ([guid]::NewGuid().ToString("N").Substring(0, 8))
  )
  $StateDirectory = Join-Path $StateRoot $GeneratedStateId
  Assert-PathHasNoReparsePoint -Path $StateDirectory -AllowMissingLeaf
  New-Item -ItemType Directory -Path $StateDirectory | Out-Null
  Assert-PathHasNoReparsePoint -Path $StateDirectory
  Set-AdministrativeDirectoryAcl $StateDirectory

  $ConfigBackupPath = Join-Path $StateDirectory "sshd_config.original"
  $CandidatePath = Join-Path $StateDirectory "sshd_config.candidate"
  $ConfigSddl = (Get-Acl -LiteralPath $ConfigPath).Sddl
  $ConfigSha256 = (
    Get-FileHash -LiteralPath $ConfigPath -Algorithm SHA256
  ).Hash
  Copy-Item -LiteralPath $ConfigPath -Destination $ConfigBackupPath
  Set-AdministrativeFileAcl $ConfigBackupPath

  Assert-PathHasNoReparsePoint -Path $PublicKeyPath
  $ProtectedAuthorizedKeysPath = Install-ProtectedAuthorizedKey `
    -SourcePath $PublicKeyPath `
    -DestinationPath (
      Join-Path $StateDirectory "authorized_keys"
    )
  $QaPublicKeyLine = Get-SinglePublicKeyLine `
    $ProtectedAuthorizedKeysPath

  $AdministratorKeyPath = Join-Path `
    $env:ProgramData `
    "ssh\administrators_authorized_keys"
  $AdministratorKeyExisted = Test-Path `
    -LiteralPath $AdministratorKeyPath `
    -PathType Leaf
  $AdministratorKeyBackupPath = Join-Path `
    $StateDirectory `
    "administrators_authorized_keys.original"
  $AdministratorKeySddl = if ($AdministratorKeyExisted) {
    (Get-Acl -LiteralPath $AdministratorKeyPath).Sddl
  } else {
    ""
  }
  $AdministratorKeyBackupSha256 = ""
  if ($AdministratorKeyExisted) {
    Copy-Item `
      -LiteralPath $AdministratorKeyPath `
      -Destination $AdministratorKeyBackupPath
    Set-AdministrativeFileAcl $AdministratorKeyBackupPath
    Assert-AdministrativePathAcl -Path $AdministratorKeyBackupPath
    $AdministratorKeyBackupSha256 = (
      Get-FileHash `
        -LiteralPath $AdministratorKeyBackupPath `
        -Algorithm SHA256
    ).Hash
  }
  $AdministratorKeyContainedQaKey = (
    $AdministratorKeyExisted -and
    (
      Test-FileContainsCanonicalPublicKey `
        -Path $AdministratorKeyPath `
        -PublicKeyLine $QaPublicKeyLine
    )
  )

  $ExistingSshGroups = @(Get-LocalGroupByName $SshGroup)
  if ($ExistingSshGroups.Count -gt 1) {
    throw "The SSH allow-group identity is ambiguous."
  }
  $ExistingSshGroup = if ($ExistingSshGroups.Count -eq 1) {
    $ExistingSshGroups[0]
  } else {
    $null
  }
  $OriginalSshGroupMemberSids = @()
  if ($ExistingSshGroup) {
    $OriginalSshGroupMemberSids = @(
      Get-LocalGroupMember `
        -Group $ExistingSshGroup.Name `
        -ErrorAction Stop |
        ForEach-Object { $_.SID.Value }
    )
  }

  $OriginalFirewallRules = @(
    Get-AutoDisableSshRules | ForEach-Object {
      [pscustomobject]@{
        name = $_.Name
        enabled = [string] $_.Enabled
        identitySnapshot = Get-FirewallRuleIdentitySnapshot $_
      }
    }
  )
  $State = [pscustomobject]@{
    id = $GeneratedStateId
    qaUser = $QaUser
    qaSid = $QaContext.SidValue
    qaAccountWasEnabled = [bool] $QaContext.User.Enabled
    qaAccountDisablePending = $false
    qaAccountDisabled = $false
    qaWasAdministrator = Test-QaIsAdministrator $QaContext
    sshGroup = $SshGroup
    sshGroupExisted = $null -ne $ExistingSshGroup
    sshGroupCreated = $null -eq $ExistingSshGroup
    sshGroupMemberAdded = $QaContext.SidValue -notin $OriginalSshGroupMemberSids
    originalSshGroupMemberSids = $OriginalSshGroupMemberSids
    protectedAuthorizedKeysPath = $ProtectedAuthorizedKeysPath
    administratorKeyPath = $AdministratorKeyPath
    administratorKeyExisted = $AdministratorKeyExisted
    administratorKeyBackupPath = $AdministratorKeyBackupPath
    administratorKeyBackupSha256 = $AdministratorKeyBackupSha256
    administratorKeySddl = $AdministratorKeySddl
    administratorKeyContainedQaKey = $AdministratorKeyContainedQaKey
    administratorKeyModified = $false
    configBackupPath = $ConfigBackupPath
    configSddl = $ConfigSddl
    configSha256 = $ConfigSha256
    candidatePath = $CandidatePath
    restrictedRemoteAddresses = @($RemoteAddress)
    originalFirewallRules = $OriginalFirewallRules
    rollbackTaskName = "YTMEnhancerQaSshRollback-$GeneratedStateId"
    restrictedFirewallRuleCreated = $false
    restrictedFirewallRulePending = $false
    configModified = $false
    previousFirewallRulesModified = $false
    administratorMembershipModified = $false
    preparePending = $true
    prepared = $false
    applied = $false
    firewallFinalized = $false
    commitPending = $false
    committed = $false
    rollbackPending = $false
    rollbackFailed = $false
    rollbackFailureCount = 0
  }
    Save-State $State $StateDirectory
    Set-CurrentStateId $GeneratedStateId
    Register-Rollback $State $StateDirectory

    try {
      Ensure-SshGroup $QaContext $SshGroup
      Write-CandidateConfig `
        -DestinationPath $CandidatePath `
        -AllowGroup $SshGroup `
        -DenyGroup $Administrators.Name `
        -AuthorizedKeysPath $ProtectedAuthorizedKeysPath
      Invoke-SshdSyntaxCheck `
        -SshdExecutable $SshdExecutable `
        -Path $CandidatePath `
        -OutputDirectory $StateDirectory
      $EffectiveConfig = Get-EffectiveSshdConfig `
        -SshdExecutable $SshdExecutable `
        -Path $CandidatePath `
        -OutputDirectory $StateDirectory `
        -UserName $QaUser
      Assert-EffectiveSshdConfig `
        -EffectiveConfig $EffectiveConfig `
        -AllowGroup $SshGroup `
        -DenyGroup $Administrators.Name `
        -ExpectedAuthorizedKeysPath $ProtectedAuthorizedKeysPath
      $State.restrictedFirewallRulePending = $true
      Save-State $State $StateDirectory
      New-RestrictedFirewallRule $RemoteAddress
      $State.restrictedFirewallRuleCreated = $true
      $State.restrictedFirewallRulePending = $false
      Save-State $State $StateDirectory

      $State.prepared = $true
      $State.preparePending = $false
      Save-State $State $StateDirectory
      Assert-ProtectedStateTree -RootPath $StateRoot
    } catch {
      Invoke-StateRollback $State $StateDirectory
      throw "OpenSSH hardening preparation failed and was rolled back."
    }

    Write-SafeResult "Prepare" @{
      prepared = $true
      stateId = $GeneratedStateId
      qaWasAdministrator = [bool] $State.qaWasAdministrator
      rollbackArmed = $true
      previousFirewallRulesPreserved = $true
    }
  } finally {
    $StateLock.Dispose()
  }
}

function Invoke-Apply {
  Assert-IsAdministrator
  Assert-LocalRecoveryConsole
  if ($FinalizeFirewall) {
    throw "Finalize the firewall only through Verify after a fresh connection."
  }
  $StateDirectory = Resolve-StateDirectory
  $StateLock = Enter-StateLock $StateDirectory
  try {
    $State = Load-State $StateDirectory
    Assert-StateIsCurrent $State
    Assert-ProtectedAuthorizedKey `
      -State $State `
      -StateDirectory $StateDirectory
    if (-not [bool] $State.prepared) {
      throw "The OpenSSH hardening state has not been prepared."
    }
    if ([bool] $State.applied) {
      throw "The OpenSSH hardening state has already been applied."
    }
    if (
      [bool] $State.firewallFinalized -or
      [bool] $State.commitPending -or
      [bool] $State.committed
    ) {
      throw "The OpenSSH hardening state is not eligible for Apply."
    }
    if (
      [bool] $State.qaAccountDisablePending -or
      [bool] $State.qaAccountDisabled -or
      [bool] $State.rollbackPending -or
      [bool] $State.rollbackFailed
    ) {
      throw "Resolve the pending rollback before applying hardening."
    }

    $QaContext = Get-QaContext $State.qaUser
    Assert-SeparateRecoveryAdministrator $QaContext
    Assert-QaAccountLoggedOff $QaContext
    if (
      -not [bool] $State.qaAccountWasEnabled -or
      -not [bool] $QaContext.User.Enabled
    ) {
      throw "The QA account enabled state changed after Prepare."
    }
    Assert-SshGroupContainsOnlyQa `
      -GroupName $State.sshGroup `
      -QaSidValue $QaContext.SidValue
    $QaIsAdministrator = Test-QaIsAdministrator $QaContext
    if ($QaIsAdministrator -ne [bool] $State.qaWasAdministrator) {
      throw "The QA administrator membership changed after Prepare."
    }
    try {
      Assert-ConfigUnchangedSincePrepare $State
    } catch {
      Invoke-StateRollback $State $StateDirectory
      throw "OpenSSH configuration changed after Prepare; the transaction was rolled back."
    }
    $SshdExecutable = Get-SshdExecutable
    Invoke-SshdSyntaxCheck `
      -SshdExecutable $SshdExecutable `
      -Path $State.candidatePath `
      -OutputDirectory $StateDirectory
    Register-Rollback $State $StateDirectory

    try {
      $State.qaAccountDisablePending = $true
      Save-State $State $StateDirectory
      Disable-LocalUser `
        -InputObject $QaContext.User `
        -ErrorAction Stop
      $QaContext = Get-QaContext $State.qaUser
      if ([bool] $QaContext.User.Enabled) {
        throw "The QA account could not be disabled for activation."
      }
      $State.qaAccountDisabled = $true
      $State.qaAccountDisablePending = $false
      Save-State $State $StateDirectory
      Assert-QaAccountLoggedOff $QaContext

      if ([bool] $State.qaWasAdministrator) {
        $State.administratorMembershipModified = $true
        Save-State $State $StateDirectory
        $Administrators = Get-AdministratorsGroup
        Remove-LocalGroupMember `
          -Group $Administrators.Name `
          -Member $QaContext.User `
          -Confirm:$false
      }
      if (Test-QaIsAdministrator $QaContext) {
        throw "The QA account could not be removed from Administrators."
      }

      Enable-LocalUser `
        -InputObject $QaContext.User `
        -ErrorAction Stop
      $QaContext = Get-QaContext $State.qaUser
      if (-not [bool] $QaContext.User.Enabled) {
        throw "The QA account could not be reenabled after activation."
      }
      $State.qaAccountDisabled = $false
      Save-State $State $StateDirectory

      Assert-ConfigUnchangedSincePrepare $State
      $State.configModified = $true
      Save-State $State $StateDirectory
      Install-SshdConfiguration `
        -CandidatePath $State.candidatePath `
        -State $State
      Restart-Service sshd -Force

      $State.applied = $true
      Save-State $State $StateDirectory
      Assert-ProtectedStateTree -RootPath $StateRoot
    } catch {
      Invoke-StateRollback $State $StateDirectory
      throw "OpenSSH hardening activation failed and was rolled back."
    }

    Write-SafeResult "Apply" @{
      applied = $true
      rollbackArmed = $true
      qaAdministratorMembershipRemoved = [bool] $State.qaWasAdministrator
      previousFirewallRulesDisabled = $false
    }
  } finally {
    $StateLock.Dispose()
  }
}

function Invoke-Verify {
  Assert-IsAdministrator
  Assert-LocalRecoveryConsole
  if ($FinalizeFirewall -and $Commit) {
    throw "FinalizeFirewall cannot be combined with Commit."
  }
  $StateDirectory = Resolve-StateDirectory
  $StateLock = Enter-StateLock $StateDirectory
  try {
  $State = Load-State $StateDirectory
  Assert-StateIsCurrent $State
  Assert-ProtectedAuthorizedKey `
    -State $State `
    -StateDirectory $StateDirectory
  if (-not [bool] $State.applied) {
    throw "The OpenSSH hardening state has not been applied."
  }
  if ([bool] $State.committed) {
    throw "The hardening transaction is already committed."
  }
  if ([bool] $State.rollbackPending -or [bool] $State.rollbackFailed) {
    throw "Resolve the pending rollback before verifying hardening."
  }
  if ([bool] $State.commitPending -and -not $Commit) {
    throw "Finish Commit or roll back the pending hardening transaction."
  }
  if ($FinalizeFirewall -and [bool] $State.firewallFinalized) {
    throw "The firewall has already been finalized."
  }

  $QaContext = Get-QaContext $State.qaUser
  Assert-SshGroupContainsOnlyQa `
    -GroupName $State.sshGroup `
    -QaSidValue $QaContext.SidValue
  $Administrators = Get-AdministratorsGroup
  $SshdExecutable = Get-SshdExecutable
  Invoke-SshdSyntaxCheck `
    -SshdExecutable $SshdExecutable `
    -Path $ConfigPath `
    -OutputDirectory $StateDirectory
  $EffectiveConfig = Get-EffectiveSshdConfig `
    -SshdExecutable $SshdExecutable `
    -Path $ConfigPath `
    -OutputDirectory $StateDirectory `
    -UserName $State.qaUser
  Assert-EffectiveSshdConfig `
    -EffectiveConfig $EffectiveConfig `
    -AllowGroup $State.sshGroup `
    -DenyGroup $Administrators.Name `
    -ExpectedAuthorizedKeysPath $State.protectedAuthorizedKeysPath

  if (Test-QaIsAdministrator $QaContext) {
    throw "The QA account is still an administrator."
  }
  if (-not (Test-GroupContainsSid $State.sshGroup $QaContext.SidValue)) {
    throw "The QA account is not in the SSH allow group."
  }

  $RestrictedRules = @(
    Get-ActiveFirewallRulesByName $RestrictedFirewallRuleName
  )
  if ($RestrictedRules.Count -ne 1) {
    throw "The restricted SSH firewall rule is not uniquely active."
  }
  $RestrictedRule = $RestrictedRules[0]
  if (
    $null -eq $RestrictedRule -or
    -not (
      Test-ManagedFirewallRule `
        -Rule $RestrictedRule `
        -ExpectedAddresses @($State.restrictedRemoteAddresses)
    )
  ) {
    throw "The restricted SSH firewall rule is not active."
  }

  $AdministratorKeyRemoved = $false
  if ($FinalizeFirewall) {
    if (-not $ConfirmInitialKeyConnection) {
      throw "Confirm a fresh key-only connection before finalizing the firewall."
    }
    $State.previousFirewallRulesModified = $true
    Save-State $State $StateDirectory
    Disable-PreviousFirewallRules $State
    $PreviousRuleCount = Get-EnabledPreviousFirewallRuleCount $State
    $BroadRuleCount = Get-EnabledBroadSshFirewallRuleCount
    if ($PreviousRuleCount -ne 0 -or $BroadRuleCount -ne 0) {
      throw "An earlier broad SSH firewall rule is still enabled."
    }
    $State.firewallFinalized = $true
    Save-State $State $StateDirectory
  }

  $PreviousRuleCount = Get-EnabledPreviousFirewallRuleCount $State
  $BroadRuleCount = Get-EnabledBroadSshFirewallRuleCount
  if (
    $RequirePreviousRulesDisabled -and
    ($PreviousRuleCount -ne 0 -or $BroadRuleCount -ne 0)
  ) {
    throw "An earlier broad SSH firewall rule is still enabled."
  }
  if ($Commit) {
    if (-not [bool] $State.firewallFinalized) {
      throw "Finalize the firewall in a separate Verify phase before Commit."
    }
    if (-not $ConfirmFinalKeyConnection) {
      throw "Confirm a fresh key-only connection before committing hardening."
    }
    if ($PreviousRuleCount -ne 0 -or $BroadRuleCount -ne 0) {
      throw "Disable earlier broad SSH firewall rules before committing."
    }

    $WasCommitPending = [bool] $State.commitPending
    if (-not $WasCommitPending) {
      if (
        [bool] $State.qaWasAdministrator -and
        [bool] $State.administratorKeyContainedQaKey
      ) {
        $AdministratorKeyRemoved = (
          Remove-QaKeyFromAdministratorAuthorizedKeys $State $StateDirectory
        )
        if (-not $AdministratorKeyRemoved) {
          throw "The QA key was not found in the shared administrator key file."
        }
      }

      $State.commitPending = $true
      Save-State $State $StateDirectory
    } elseif (
      [bool] $State.qaWasAdministrator -and
      [bool] $State.administratorKeyContainedQaKey
    ) {
      $AdministratorKeyRemoved = (
        Remove-QaKeyFromAdministratorAuthorizedKeys $State $StateDirectory
      )
      if (-not $AdministratorKeyRemoved) {
        throw "The QA key cleanup could not be verified during Commit retry."
      }
    }

    if ($WasCommitPending) {
      Unregister-Rollback $State -AllowMissing
    } else {
      Unregister-Rollback $State
    }
    $State.committed = $true
    $State.commitPending = $false
    Save-State $State $StateDirectory
    Assert-ProtectedStateTree -RootPath $StateRoot
  }

  Write-SafeResult "Verify" @{
    configHardened = $true
    qaNonAdmin = $true
    restrictedFirewall = $true
    previousFirewallRuleCount = $PreviousRuleCount
    broadFirewallRuleCount = $BroadRuleCount
    administratorKeyRemoved = [bool] $AdministratorKeyRemoved
    rollbackCancelled = [bool] $Commit
  }
  } finally {
    $StateLock.Dispose()
  }
}

function Invoke-Rollback {
  Assert-IsAdministrator
  if ($FromScheduledTask) {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if ($Identity.User.Value -ne $SystemSidValue) {
      throw "Scheduled rollback must run as SYSTEM."
    }
  } else {
    Assert-LocalRecoveryConsole
  }
  $StateDirectory = Resolve-StateDirectory
  if ($FromScheduledTask) {
    $ScriptDirectory = [IO.Path]::GetFullPath(
      (Split-Path -Parent $PSCommandPath)
    ).TrimEnd("\")
    $ExpectedDirectory = [IO.Path]::GetFullPath(
      $StateDirectory
    ).TrimEnd("\")
    if ($ScriptDirectory -ne $ExpectedDirectory) {
      throw "Scheduled rollback must use the protected state copy."
    }
  }
  $LockTimeoutSeconds = if ($FromScheduledTask) { 0 } else { 30 }
  $StateLock = Enter-StateLock $StateDirectory $LockTimeoutSeconds
  try {
    $State = Load-State $StateDirectory
    $TransactionActive = (
      [bool] $State.preparePending -or
      [bool] $State.prepared -or
      [bool] $State.applied -or
      [bool] $State.firewallFinalized -or
      [bool] $State.commitPending -or
      [bool] $State.qaAccountDisablePending -or
      [bool] $State.qaAccountDisabled -or
      [bool] $State.rollbackPending -or
      [bool] $State.rollbackFailed
    )
    if ([bool] $State.committed -or -not $TransactionActive) {
      if (-not $FromScheduledTask) {
        throw "The OpenSSH hardening transaction is no longer rollback-eligible."
      }
      Write-SafeResult "Rollback" @{
        restored = $false
        automatic = $true
        scheduledRollbackSkipped = $true
      }
      return
    }

    Assert-StateIsCurrent $State
    Invoke-StateRollback $State $StateDirectory

    Write-SafeResult "Rollback" @{
      restored = $true
      automatic = [bool] $FromScheduledTask
      scheduledRollbackSkipped = $false
    }
  } finally {
    $StateLock.Dispose()
  }
}

switch ($Mode) {
  "Audit" {
    Invoke-Audit
  }
  "Prepare" {
    Invoke-Prepare
  }
  "Apply" {
    Invoke-Apply
  }
  "Verify" {
    Invoke-Verify
  }
  "Rollback" {
    Invoke-Rollback
  }
}

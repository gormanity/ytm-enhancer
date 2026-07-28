$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Get-NormalizedQaPath {
  param([Parameter(Mandatory = $true)][string] $Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "Windows QA work root is invalid."
  }

  try {
    $ExpandedPath = [Environment]::ExpandEnvironmentVariables($Path)
    if ($ExpandedPath -notmatch "^[A-Za-z]:[\\/]") {
      throw "The path is not an absolute local-drive path."
    }
    $FullPath = [IO.Path]::GetFullPath($ExpandedPath)
  } catch {
    throw "Windows QA work root is invalid."
  }

  return $FullPath.TrimEnd([char[]] @([char] 92, [char] 47))
}

function Test-QaPathAtOrBelow {
  param(
    [Parameter(Mandatory = $true)][string] $CandidatePath,
    [Parameter(Mandatory = $true)][string] $ProtectedPath
  )

  $Candidate = Get-NormalizedQaPath $CandidatePath
  $Protected = Get-NormalizedQaPath $ProtectedPath
  return (
    [string]::Equals(
      $Candidate,
      $Protected,
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    $Candidate.StartsWith(
      $Protected + [IO.Path]::DirectorySeparatorChar,
      [StringComparison]::OrdinalIgnoreCase
    )
  )
}

function Assert-SafeQaWorkRoot {
  param([Parameter(Mandatory = $true)][string] $Path)

  $FullPath = Get-NormalizedQaPath $Path
  $PathRoot = [IO.Path]::GetPathRoot($FullPath)
  if (
    [string]::IsNullOrWhiteSpace($PathRoot) -or
    $FullPath.StartsWith("\\") -or
    [string]::Equals(
      $FullPath,
      $PathRoot.TrimEnd([char[]] @([char] 92, [char] 47)),
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Windows QA work root is unsafe."
  }

  $RelativePath = $FullPath.Substring($PathRoot.Length)
  $Segments = @(
    $RelativePath.Split(
      [char[]] @([char] 92, [char] 47),
      [StringSplitOptions]::RemoveEmptyEntries
    )
  )
  if ($Segments.Count -lt 3) {
    throw "Windows QA work root is unsafe."
  }

  $ProtectedTrees = @(
    [Environment]::GetFolderPath("Windows"),
    [Environment]::GetFolderPath("CommonApplicationData"),
    [Environment]::GetFolderPath("ProgramFiles"),
    [Environment]::GetFolderPath("ProgramFilesX86")
  )
  foreach ($ProtectedTree in $ProtectedTrees) {
    if (
      -not [string]::IsNullOrWhiteSpace($ProtectedTree) -and
      (Test-QaPathAtOrBelow $FullPath $ProtectedTree)
    ) {
      throw "Windows QA work root is unsafe."
    }
  }

  $SensitivePaths = @(
    [Environment]::GetFolderPath("UserProfile"),
    [Environment]::GetFolderPath("LocalApplicationData"),
    [Environment]::GetFolderPath("ApplicationData"),
    [IO.Path]::GetTempPath()
  )
  foreach ($SensitivePath in $SensitivePaths) {
    if ([string]::IsNullOrWhiteSpace($SensitivePath)) {
      continue
    }
    if ([string]::Equals(
        $FullPath,
        (Get-NormalizedQaPath $SensitivePath),
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "Windows QA work root is unsafe."
    }
  }

  $AncestorPath = $PathRoot
  foreach ($Segment in $Segments) {
    $AncestorPath = Join-Path $AncestorPath $Segment
    if (-not (Test-Path -LiteralPath $AncestorPath)) {
      continue
    }
    $RootItem = Get-Item -LiteralPath $AncestorPath -Force
    if (
      ($RootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      throw "Windows QA work root is unsafe."
    }
  }

  return $FullPath
}

function Assert-QaWorkRootOwnership {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [switch] $AllowAdoption
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $MarkerPath = Join-Path $Path ".ytm-enhancer-remote-qa-root"
  if (Test-Path -LiteralPath $MarkerPath -PathType Leaf) {
    $MarkerItem = Get-Item `
      -LiteralPath $MarkerPath `
      -Force `
      -ErrorAction Stop
    if (
      ($MarkerItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      throw "Windows QA work root marker is unsafe."
    }
    $MarkerContent = [IO.File]::ReadAllText($MarkerPath)
    if (-not [string]::Equals(
        $MarkerContent,
        "YTM Enhancer remote QA root",
        [StringComparison]::Ordinal
      )) {
      throw "Windows QA work root marker is invalid."
    }
    return
  }
  if (-not $AllowAdoption) {
    throw "Windows QA work root is not marked."
  }

  $RequiredSentinels = @(
    "PROJECT.md",
    "package.json",
    "scripts\remote\windows-qa\run.sh"
  )
  foreach ($RelativePath in $RequiredSentinels) {
    $SentinelPath = Join-Path $Path $RelativePath
    if (-not (Test-Path -LiteralPath $SentinelPath -PathType Leaf)) {
      throw "Windows QA work root cannot be adopted."
    }
  }

  $MarkerStream = [IO.File]::Open(
    $MarkerPath,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
  )
  try {
    $MarkerBytes = [Text.Encoding]::UTF8.GetBytes(
      "YTM Enhancer remote QA root"
    )
    $MarkerStream.Write($MarkerBytes, 0, $MarkerBytes.Length)
  } finally {
    $MarkerStream.Dispose()
  }
}

function Assert-NoQaReparsePoints {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    return
  }

  $PendingDirectories = [Collections.Generic.Stack[string]]::new()
  $PendingDirectories.Push([IO.Path]::GetFullPath($Path))
  try {
    while ($PendingDirectories.Count -gt 0) {
      $DirectoryPath = $PendingDirectories.Pop()
      foreach ($Item in @(
        Get-ChildItem `
          -LiteralPath $DirectoryPath `
          -Force `
          -ErrorAction Stop
      )) {
        if (
          ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
        ) {
          throw "A descendant reparse point is not allowed."
        }
        if ($Item.PSIsContainer) {
          $PendingDirectories.Push($Item.FullName)
        }
      }
    }
  } catch {
    throw "Windows QA work root failed reparse-point validation."
  }
}

function Remove-QaReparsePoint {
  param([Parameter(Mandatory = $true)] $Item)

  if (
    ($Item.Attributes -band [IO.FileAttributes]::Directory) -ne 0
  ) {
    [IO.Directory]::Delete($Item.FullName, $false)
  } else {
    [IO.File]::Delete($Item.FullName)
  }
}

function Remove-QaTreeNoFollow {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $RootItem = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (
    ($RootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  ) {
    Remove-QaReparsePoint $RootItem
    return
  }
  if (-not $RootItem.PSIsContainer) {
    Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
    return
  }

  $PendingDirectories = [Collections.Generic.Stack[string]]::new()
  $Directories = [Collections.Generic.List[string]]::new()
  $PendingDirectories.Push($RootItem.FullName)
  while ($PendingDirectories.Count -gt 0) {
    $DirectoryPath = $PendingDirectories.Pop()
    $Directories.Add($DirectoryPath)
    foreach ($Item in @(
      Get-ChildItem `
        -LiteralPath $DirectoryPath `
        -Force `
        -ErrorAction Stop
    )) {
      if (
        ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
      ) {
        Remove-QaReparsePoint $Item
        continue
      }
      if ($Item.PSIsContainer) {
        $PendingDirectories.Push($Item.FullName)
      } else {
        Remove-Item `
          -LiteralPath $Item.FullName `
          -Force `
          -ErrorAction Stop
      }
    }
  }

  for ($Index = $Directories.Count - 1; $Index -ge 0; $Index -= 1) {
    [IO.Directory]::Delete($Directories[$Index], $false)
  }
}

function Remove-QaTree {
  param([Parameter(Mandatory = $true)][string] $Path)

  $Path = Assert-SafeQaWorkRoot $Path
  Assert-QaWorkRootOwnership $Path
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Process chrome, msedge, firefox, YTMTray, YTMTray.NativeHost `
    -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500

  try {
    Remove-QaTreeNoFollow $Path
  } catch {
    throw "Unable to remove Windows QA work root."
  }
  if (Test-Path -LiteralPath $Path) {
    throw "Unable to remove Windows QA work root."
  }
}

function Remove-StaleQaStagingDirectories {
  param([Parameter(Mandatory = $true)][string] $ParentPath)

  $StaleBefore = [DateTime]::UtcNow.AddHours(-1)
  foreach ($Item in @(
      Get-ChildItem -LiteralPath $ParentPath -Force -ErrorAction Stop
    )) {
    if ($Item.Name -notmatch "^\.ytme-source-staging-[0-9a-f]{32}$") {
      continue
    }
    if (
      -not $Item.PSIsContainer -or
      ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      throw "Windows QA found an unsafe stale source staging entry."
    }
    if ($Item.LastWriteTimeUtc -lt $StaleBefore) {
      Remove-QaTreeNoFollow $Item.FullName
    }
  }
}

function Remove-StaleQaMergeArtifacts {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    return
  }

  $RootItem = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (
    -not $RootItem.PSIsContainer -or
    ($RootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  ) {
    throw "Windows QA found an unsafe source merge root."
  }

  $StaleBefore = [DateTime]::UtcNow.AddHours(-1)
  $PendingDirectories = [Collections.Generic.Stack[string]]::new()
  $PendingDirectories.Push($RootItem.FullName)
  while ($PendingDirectories.Count -gt 0) {
    $DirectoryPath = $PendingDirectories.Pop()
    $DirectoryItem = Get-Item `
      -LiteralPath $DirectoryPath `
      -Force `
      -ErrorAction Stop
    if (
      -not $DirectoryItem.PSIsContainer -or
      (
        $DirectoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint
      ) -ne 0
    ) {
      throw "Windows QA found an unsafe source merge directory."
    }
    foreach ($Item in @(
      Get-ChildItem `
        -LiteralPath $DirectoryItem.FullName `
        -Force `
        -ErrorAction Stop
    )) {
      $IsMergeArtifact = (
        $Item.Name -match "\.ytme-sync(?:-backup)?-[0-9a-f]{32}$"
      )
      if (
        ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
      ) {
        if ($IsMergeArtifact) {
          throw "Windows QA found an unsafe stale source merge entry."
        }
        continue
      }
      if ($Item.PSIsContainer) {
        if ($IsMergeArtifact) {
          throw "Windows QA found an unsafe stale source merge entry."
        }
        $PendingDirectories.Push($Item.FullName)
        continue
      }
      if ($IsMergeArtifact -and $Item.LastWriteTimeUtc -lt $StaleBefore) {
        [IO.File]::Delete($Item.FullName)
      }
    }
  }
}

function Test-PrivateQaResidueRelativePath {
  param([Parameter(Mandatory = $true)][string] $RelativePath)

  $NormalizedPath = $RelativePath.Replace("\", "/").ToLowerInvariant()
  $Segments = @(
    $NormalizedPath.Split(
      [char[]] @([char] 47),
      [StringSplitOptions]::RemoveEmptyEntries
    )
  )
  if ($Segments.Count -eq 0) {
    return $false
  }

  $PrivateDirectoryNames = @(
    ".claude",
    ".agents",
    ".codex",
    ".direnv",
    ".ssh",
    ".git",
    ".jj",
    ".hg",
    ".svn"
  )
  foreach ($Segment in $Segments) {
    if ($Segment -in $PrivateDirectoryNames) {
      return $true
    }
  }

  $FileName = $Segments[$Segments.Count - 1]
  if (
    $FileName -eq "claude.md" -or
    $FileName -match "^\.env(?:\.|$)" -or
    $FileName -eq ".envrc" -or
    $FileName.StartsWith(
      ".remote-qa.env",
      [StringComparison]::Ordinal
    ) -or
    $FileName -match "^id_(?:dsa|ecdsa|ed25519|rsa)(?:\.pub)?$"
  ) {
    return $true
  }

  $PrivateFileNames = @(
    ".netrc",
    ".npmrc",
    ".pypirc",
    "authorized_keys",
    "credentials",
    "credentials.json",
    "known_hosts",
    "secrets.json",
    "service-account.json"
  )
  if ($FileName -in $PrivateFileNames) {
    return $true
  }

  $PrivateExtensions = @(
    ".cer",
    ".crt",
    ".der",
    ".jks",
    ".kdbx",
    ".key",
    ".keystore",
    ".p12",
    ".pem",
    ".pfx",
    ".ppk"
  )
  return [IO.Path]::GetExtension($FileName) -in $PrivateExtensions
}

function Remove-PrivateQaResidue {
  param([Parameter(Mandatory = $true)][string] $RootPath)

  if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) {
    return
  }

  $RootPath = [IO.Path]::GetFullPath($RootPath).TrimEnd(
    [char[]] @([char] 92, [char] 47)
  )
  $PendingDirectories = [Collections.Generic.Stack[string]]::new()
  $PendingDirectories.Push($RootPath)

  while ($PendingDirectories.Count -gt 0) {
    $DirectoryPath = $PendingDirectories.Pop()
    foreach ($Item in @(
      Get-ChildItem `
        -LiteralPath $DirectoryPath `
        -Force `
        -ErrorAction Stop
    )) {
      $RelativePath = $Item.FullName.Substring($RootPath.Length).TrimStart(
        [char[]] @([char] 92, [char] 47)
      )
      if (
        ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
      ) {
        if (Test-PrivateQaResidueRelativePath $RelativePath) {
          Remove-QaReparsePoint $Item
        }
        continue
      }
      if (Test-PrivateQaResidueRelativePath $RelativePath) {
        if ($Item.PSIsContainer) {
          Remove-QaTreeNoFollow $Item.FullName
        } else {
          Remove-Item `
            -LiteralPath $Item.FullName `
            -Force `
            -ErrorAction Stop
        }
        continue
      }

      if ($Item.PSIsContainer) {
        $PendingDirectories.Push($Item.FullName)
      }
    }
  }
}

function Assert-QaArchiveIntegrity {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][long] $ExpectedLength,
    [Parameter(Mandatory = $true)][string] $ExpectedSha256
  )

  $ArchiveItem = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (
    -not $ArchiveItem.PSIsContainer -and
    (
      $ArchiveItem.Attributes -band [IO.FileAttributes]::ReparsePoint
    ) -eq 0 -and
    $ArchiveItem.Length -eq $ExpectedLength
  ) {
    $ActualSha256 = (
      Get-FileHash -LiteralPath $Path -Algorithm SHA256
    ).Hash
    if ([string]::Equals(
        $ActualSha256,
        $ExpectedSha256,
        [StringComparison]::OrdinalIgnoreCase
      )) {
      return
    }
  }

  throw "Windows QA source archive failed integrity validation."
}

function Get-QaArchiveManifestPaths {
  param([Parameter(Mandatory = $true)][string] $EncodedManifest)

  try {
    $ManifestBytes = [Convert]::FromBase64String($EncodedManifest)
    if (
      $ManifestBytes.Length -eq 0 -or
      $ManifestBytes[$ManifestBytes.Length - 1] -ne 0
    ) {
      throw "Manifest framing failed."
    }
    $Utf8 = [Text.UTF8Encoding]::new($false, $true)
    $ManifestText = $Utf8.GetString($ManifestBytes)
    $ManifestParts = @($ManifestText.Split([char] 0))
    if (
      $ManifestParts.Count -lt 2 -or
      $ManifestParts[$ManifestParts.Count - 1] -ne ""
    ) {
      throw "Manifest framing failed."
    }
    return @($ManifestParts[0..($ManifestParts.Count - 2)])
  } catch {
    throw "Windows QA source manifest failed validation."
  }
}

function Assert-QaRelativeArchivePath {
  param([Parameter(Mandatory = $true)][string] $RelativePath)

  if (
    [string]::IsNullOrWhiteSpace($RelativePath) -or
    $RelativePath.StartsWith("/") -or
    $RelativePath.StartsWith("-") -or
    $RelativePath.Contains("\") -or
    $RelativePath.Contains(":") -or
    $RelativePath -match "[\x00-\x1f\x7f]"
  ) {
    throw "Windows QA source manifest contains an unsafe path."
  }

  $Segments = @($RelativePath.Split([char] 47))
  foreach ($Segment in $Segments) {
    if (
      [string]::IsNullOrWhiteSpace($Segment) -or
      $Segment -in @(".", "..") -or
      $Segment -match "[. ]$"
    ) {
      throw "Windows QA source manifest contains an unsafe path."
    }
  }
}

function Get-QaChildItemByName {
  param(
    [Parameter(Mandatory = $true)][string] $DirectoryPath,
    [Parameter(Mandatory = $true)][string] $Name
  )

  $Matches = @(
    Get-ChildItem `
      -LiteralPath $DirectoryPath `
      -Force `
      -ErrorAction Stop |
      Where-Object {
        [string]::Equals(
          $_.Name,
          $Name,
          [StringComparison]::OrdinalIgnoreCase
        )
      }
  )
  if ($Matches.Count -gt 1) {
    throw "Windows QA destination path is ambiguous."
  }
  if ($Matches.Count -eq 1) {
    return $Matches[0]
  }
  return $null
}

function Assert-QaDestinationPathSafe {
  param(
    [Parameter(Mandatory = $true)][string] $TargetPath,
    [Parameter(Mandatory = $true)][string] $RelativePath
  )

  Assert-QaRelativeArchivePath $RelativePath
  $Segments = @($RelativePath.Split([char] 47))
  $CurrentDirectory = $TargetPath
  for ($Index = 0; $Index -lt $Segments.Count; $Index += 1) {
    if (-not (Test-Path -LiteralPath $CurrentDirectory -PathType Container)) {
      return
    }
    $Item = Get-QaChildItemByName $CurrentDirectory $Segments[$Index]
    if ($null -eq $Item) {
      return
    }
    if (
      ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      throw "Windows QA refused an archive path through a reparse point."
    }

    $IsLeaf = $Index -eq ($Segments.Count - 1)
    if ($IsLeaf) {
      if ($Item.PSIsContainer) {
        throw "Windows QA source file conflicts with a destination directory."
      }
      return
    }
    if (-not $Item.PSIsContainer) {
      throw "Windows QA source path has a non-directory ancestor."
    }
    $CurrentDirectory = $Item.FullName
  }
}

function Assert-ArchivePathsAvoidQaReparsePoints {
  param(
    [Parameter(Mandatory = $true)][string] $TargetPath,
    [Parameter(Mandatory = $true)][string[]] $RelativePaths
  )

  foreach ($RelativePath in $RelativePaths) {
    Assert-QaDestinationPathSafe $TargetPath $RelativePath
  }
}

function Get-QaStagedRelativeFiles {
  param([Parameter(Mandatory = $true)][string] $StagingPath)

  $RootPath = [IO.Path]::GetFullPath($StagingPath).TrimEnd(
    [char[]] @([char] 92, [char] 47)
  )
  $PendingDirectories = [Collections.Generic.Stack[string]]::new()
  $RelativeFiles = [Collections.Generic.List[string]]::new()
  $PendingDirectories.Push($RootPath)
  while ($PendingDirectories.Count -gt 0) {
    $DirectoryPath = $PendingDirectories.Pop()
    foreach ($Item in @(
      Get-ChildItem `
        -LiteralPath $DirectoryPath `
        -Force `
        -ErrorAction Stop
    )) {
      if (
        ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
      ) {
        throw "Windows QA source staging contains a reparse point."
      }
      if ($Item.PSIsContainer) {
        $PendingDirectories.Push($Item.FullName)
        continue
      }
      $RelativeFiles.Add(
        $Item.FullName.Substring($RootPath.Length).TrimStart(
          [char[]] @([char] 92, [char] 47)
        ).Replace("\", "/")
      )
    }
  }

  return @($RelativeFiles)
}

function Assert-QaStagingMatchesManifest {
  param(
    [Parameter(Mandatory = $true)][string] $StagingPath,
    [Parameter(Mandatory = $true)][string[]] $RelativePaths
  )

  $Expected = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::Ordinal
  )
  foreach ($RelativePath in $RelativePaths) {
    Assert-QaRelativeArchivePath $RelativePath
    if (-not $Expected.Add($RelativePath)) {
      throw "Windows QA source manifest contains a duplicate path."
    }
  }

  $Actual = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::Ordinal
  )
  foreach ($RelativePath in @(Get-QaStagedRelativeFiles $StagingPath)) {
    if (-not $Actual.Add($RelativePath)) {
      throw "Windows QA source staging contains a duplicate path."
    }
  }
  if (
    $Expected.Count -ne $Actual.Count -or
    -not $Expected.SetEquals($Actual)
  ) {
    throw "Windows QA source staging does not match the validated manifest."
  }
}

function Get-QaMergeDestinationPath {
  param(
    [Parameter(Mandatory = $true)][string] $TargetPath,
    [Parameter(Mandatory = $true)][string] $RelativePath
  )

  Assert-QaDestinationPathSafe $TargetPath $RelativePath
  $Segments = @($RelativePath.Split([char] 47))
  $CurrentDirectory = $TargetPath
  for ($Index = 0; $Index -lt ($Segments.Count - 1); $Index += 1) {
    $Item = Get-QaChildItemByName $CurrentDirectory $Segments[$Index]
    if ($null -eq $Item) {
      $NewDirectory = Join-Path $CurrentDirectory $Segments[$Index]
      New-Item `
        -ItemType Directory `
        -Path $NewDirectory `
        -ErrorAction Stop |
        Out-Null
      $Item = Get-Item -LiteralPath $NewDirectory -Force -ErrorAction Stop
    }
    if (
      -not $Item.PSIsContainer -or
      ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      throw "Windows QA destination ancestor is unsafe."
    }
    $CurrentDirectory = $Item.FullName
  }

  Assert-QaDestinationPathSafe $TargetPath $RelativePath
  return Join-Path $CurrentDirectory $Segments[$Segments.Count - 1]
}

function Merge-QaStagedFiles {
  param(
    [Parameter(Mandatory = $true)][string] $StagingPath,
    [Parameter(Mandatory = $true)][string] $TargetPath,
    [Parameter(Mandatory = $true)][string[]] $RelativePaths
  )

  foreach ($RelativePath in $RelativePaths) {
    $SourcePath = Join-Path $StagingPath $RelativePath.Replace("/", "\")
    $DestinationPath = Get-QaMergeDestinationPath `
      $TargetPath `
      $RelativePath
    $TemporaryPath = (
      "$DestinationPath.ytme-sync-" +
      [guid]::NewGuid().ToString("N")
    )
    $DisplacedPath = (
      "$DestinationPath.ytme-sync-backup-" +
      [guid]::NewGuid().ToString("N")
    )
    try {
      Copy-Item `
        -LiteralPath $SourcePath `
        -Destination $TemporaryPath `
        -ErrorAction Stop
      Assert-QaDestinationPathSafe $TargetPath $RelativePath
      if (Test-Path -LiteralPath $DestinationPath -PathType Leaf) {
        [IO.File]::Replace(
          $TemporaryPath,
          $DestinationPath,
          $DisplacedPath
        )
      } elseif (Test-Path -LiteralPath $DestinationPath) {
        throw "Windows QA source file conflicts with a destination object."
      } else {
        [IO.File]::Move($TemporaryPath, $DestinationPath)
      }
    } finally {
      Remove-Item `
        -LiteralPath $TemporaryPath `
        -Force `
        -ErrorAction SilentlyContinue
      Remove-Item `
        -LiteralPath $DisplacedPath `
        -Force `
        -ErrorAction SilentlyContinue
    }
  }
}

function New-QaRootMarker {
  param([Parameter(Mandatory = $true)][string] $Path)

  $MarkerPath = Join-Path $Path ".ytm-enhancer-remote-qa-root"
  $MarkerStream = [IO.File]::Open(
    $MarkerPath,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
  )
  try {
    $MarkerBytes = [Text.Encoding]::UTF8.GetBytes(
      "YTM Enhancer remote QA root"
    )
    $MarkerStream.Write($MarkerBytes, 0, $MarkerBytes.Length)
  } finally {
    $MarkerStream.Dispose()
  }
}

$target = Assert-SafeQaWorkRoot $target
if ([bool] $AdoptWorkRoot -and -not [bool] $PreserveApps) {
  throw "Windows QA work-root adoption requires preserve mode."
}
Assert-QaWorkRootOwnership $target -AllowAdoption:$AdoptWorkRoot
Assert-QaArchiveIntegrity `
  -Path $ArchivePath `
  -ExpectedLength $ExpectedArchiveLength `
  -ExpectedSha256 $ExpectedArchiveSha256
$ManifestPaths = @(
  Get-QaArchiveManifestPaths -EncodedManifest $ManifestBase64
)
if ($ManifestPaths.Count -eq 0) {
  throw "Windows QA source manifest is empty."
}

$TargetParent = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $TargetParent | Out-Null
Remove-StaleQaStagingDirectories $TargetParent
$StagingPath = Join-Path `
  $TargetParent `
  (".ytme-source-staging-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Path $StagingPath -ErrorAction Stop |
    Out-Null
  tar -xzf $ArchivePath -C $StagingPath
  if ($LASTEXITCODE -ne 0) {
    throw "Windows QA source archive extraction failed."
  }
  Assert-NoQaReparsePoints $StagingPath
  Assert-QaStagingMatchesManifest $StagingPath $ManifestPaths
  Remove-PrivateQaResidue -RootPath $StagingPath

  if (-not [bool] $PreserveApps) {
    Remove-QaTree -Path $target
    New-QaRootMarker $StagingPath
    [IO.Directory]::Move($StagingPath, $target)
    $StagingPath = ""
  } else {
    $TargetExisted = Test-Path -LiteralPath $target -PathType Container
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Remove-StaleQaMergeArtifacts $target
    Assert-ArchivePathsAvoidQaReparsePoints $target $ManifestPaths
    Remove-PrivateQaResidue $target
    Merge-QaStagedFiles $StagingPath $target $ManifestPaths
    if (-not $TargetExisted) {
      New-QaRootMarker $target
    }
    Remove-PrivateQaResidue $target
  }
} finally {
  if (
    -not [string]::IsNullOrWhiteSpace($StagingPath) -and
    (Test-Path -LiteralPath $StagingPath)
  ) {
    Remove-QaTreeNoFollow $StagingPath
  }
}

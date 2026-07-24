[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $ArchivePath,
  [Parameter(Mandatory = $true)]
  [string] $PayloadRoot
)

$ErrorActionPreference = "Stop"

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)][object] $Expected,
    [Parameter(Mandatory = $true)][object] $Actual,
    [Parameter(Mandatory = $true)][string] $Label
  )

  if ($Expected -ne $Actual) {
    throw "$Label expected '$Expected', got '$Actual'"
  }
}

function Assert-ExplorerArchiveCompatible {
  param(
    [Parameter(Mandatory = $true)]
    [string] $ArchivePath,
    [Parameter(Mandatory = $true)]
    [string] $PayloadRoot
  )

  if (
    [Threading.Thread]::CurrentThread.GetApartmentState() -ne
    [Threading.ApartmentState]::STA
  ) {
    throw "Windows Explorer archive validation requires an STA PowerShell process."
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $ResolvedArchivePath = (Resolve-Path -LiteralPath $ArchivePath).ProviderPath
  $ResolvedPayloadRoot = (Resolve-Path -LiteralPath $PayloadRoot).ProviderPath
  $PayloadPrefixLength = $ResolvedPayloadRoot.TrimEnd(
    [IO.Path]::DirectorySeparatorChar
  ).Length + 1
  $ExpectedTopLevelCount = @(
    Get-ChildItem -LiteralPath $ResolvedPayloadRoot -Force
  ).Count
  $ExpectedFiles = @(
    Get-ChildItem -LiteralPath $ResolvedPayloadRoot -File -Recurse -Force |
      ForEach-Object {
        $_.FullName.Substring($PayloadPrefixLength).Replace("\", "/")
      } |
      Sort-Object
  )

  if ($ExpectedTopLevelCount -le 0) {
    throw "Release payload contains no top-level items: $ResolvedPayloadRoot"
  }

  $ZipArchive = [IO.Compression.ZipFile]::OpenRead($ResolvedArchivePath)
  try {
    $ActualFiles = @(
      foreach ($Entry in $ZipArchive.Entries) {
        $NormalizedName = $Entry.FullName.Replace("\", "/")
        if (
          $NormalizedName -eq "." -or
          $NormalizedName -eq "./" -or
          $NormalizedName.StartsWith("./") -or
          $NormalizedName.StartsWith("/")
        ) {
          throw "Release archive contains an Explorer-incompatible entry: $($Entry.FullName)"
        }

        if (-not [string]::IsNullOrEmpty($Entry.Name)) {
          $NormalizedName
        }
      }
    ) | Sort-Object

    Assert-Equal $ExpectedFiles.Count $ActualFiles.Count "release archive file count"
    Assert-Equal ($ExpectedFiles -join "`n") ($ActualFiles -join "`n") "release archive files"
  } finally {
    $ZipArchive.Dispose()
  }

  $Shell = $null
  $ArchiveNamespace = $null
  $ArchiveItems = $null
  try {
    $Shell = New-Object -ComObject Shell.Application
    $ArchiveNamespace = $Shell.NameSpace([string] $ResolvedArchivePath)
    if ($null -eq $ArchiveNamespace) {
      throw "Windows Explorer could not open release archive: $ResolvedArchivePath"
    }

    $ArchiveItems = $ArchiveNamespace.Items()
    if ($ArchiveItems.Count -le 0) {
      throw "Windows Explorer found no release archive items: $ResolvedArchivePath"
    }

    Assert-Equal `
      $ExpectedTopLevelCount `
      $ArchiveItems.Count `
      "Windows Explorer top-level archive item count"
  } finally {
    foreach ($ComObject in @($ArchiveItems, $ArchiveNamespace, $Shell)) {
      if (
        $null -ne $ComObject -and
        [Runtime.InteropServices.Marshal]::IsComObject($ComObject)
      ) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($ComObject)
      }
    }
  }

  Write-Output "Windows Explorer archive validation passed: $ResolvedArchivePath"
}

Assert-ExplorerArchiveCompatible `
  -ArchivePath $ArchivePath `
  -PayloadRoot $PayloadRoot

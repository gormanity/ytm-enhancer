$ErrorActionPreference = "Stop"

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  $FileName = [IO.Path]::GetFileName($FilePath)
  if (
    $FileName -ieq "YTMTray.Setup.exe" -or
    $FileName -like "YTM-Tray-*-Setup.exe"
  ) {
    $CommandLine = @(
      $Arguments | ForEach-Object {
        if ($_ -notmatch '[\s"]' -and $_.Length -gt 0) {
          $_
        } else {
          '"' + (($_ -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
        }
      }
    ) -join " "
    $Process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $CommandLine `
      -Wait `
      -PassThru
    if ($Process.ExitCode -ne 0) {
      throw "$FilePath exited with code $($Process.ExitCode)"
    }
    return
  }

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

function Assert-PathExists {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Expected path to exist: $Path"
  }
}

function Assert-PathMissing {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (Test-Path -LiteralPath $Path) {
    throw "Expected path to be removed: $Path"
  }
}

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

function Assert-Throws {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock] $Script,
    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  try {
    & $Script
  } catch {
    return
  }

  throw "Expected failure: $Label"
}

function Assert-NoInstalledScripts {
  param([Parameter(Mandatory = $true)][string] $Path)

  $Scripts = @(
    Get-ChildItem -LiteralPath $Path -Recurse -File |
      Where-Object { $_.Extension -in @(".cmd", ".ps1") }
  )
  if ($Scripts.Count -gt 0) {
    throw "Expected no installed command or PowerShell scripts; found: $($Scripts.FullName -join ', ')"
  }
}

function Get-InstalledTrayProcesses {
  $ExpectedPath = [IO.Path]::GetFullPath(
    (Join-Path $InstallRoot "YTMTray.exe")
  )
  return @(
    Get-Process -Name "YTMTray" -ErrorAction SilentlyContinue |
      Where-Object {
        try {
          -not [string]::IsNullOrWhiteSpace($_.Path) -and
            [IO.Path]::GetFullPath($_.Path) -ieq $ExpectedPath
        } catch {
          $false
        }
      }
  )
}

function Assert-NoInstalledTrayProcess {
  $Processes = @(Get-InstalledTrayProcesses)
  if ($Processes.Count -gt 0) {
    throw "Expected quiet or failed setup not to launch $InstallRoot\YTMTray.exe; found process IDs: $($Processes.Id -join ', ')"
  }
}

function Assert-LogContains {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $Expected
  )

  Assert-PathExists $Path
  $Contents = Get-Content -LiteralPath $Path -Raw
  if (-not $Contents.Contains($Expected)) {
    throw "Expected $Path to contain: $Expected"
  }
}

function Assert-LogExcludes {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $Unexpected
  )

  Assert-PathExists $Path
  $Contents = Get-Content -LiteralPath $Path -Raw
  if ($Contents.Contains($Unexpected)) {
    throw "Expected $Path not to contain: $Unexpected"
  }
}

function Assert-Shortcut {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $ExpectedTargetPath,
    [string] $ExpectedArguments = ""
  )

  Assert-PathExists $Path
  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($Path)
  $ResolvedExpectedTargetPath = (
    Get-Item -LiteralPath $ExpectedTargetPath
  ).FullName
  $ResolvedActualTargetPath = (
    Get-Item -LiteralPath $Shortcut.TargetPath
  ).FullName
  Assert-Equal `
    $ResolvedExpectedTargetPath `
    $ResolvedActualTargetPath `
    "$Path target"
  Assert-Equal $ExpectedArguments $Shortcut.Arguments "$Path arguments"
}

function Wait-Uninstalled {
  param([int] $TimeoutSeconds = 30)

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while (
    (
      (Test-Path -LiteralPath $InstallRoot) -or
      (Test-Path -LiteralPath $UninstallRegistryKey) -or
      (Test-Path -LiteralPath $TrayShortcutPath) -or
      (Test-Path -LiteralPath $UninstallShortcutPath)
    ) -and
    (Get-Date) -lt $Deadline
  ) {
    Start-Sleep -Milliseconds 250
  }
}

function Remove-QaTree {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $Deadline = (Get-Date).AddSeconds(15)
  $LastError = $null
  do {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    } catch [System.IO.IOException], [System.UnauthorizedAccessException] {
      $LastError = $_
      Start-Sleep -Milliseconds 300
    }
  } while ((Get-Date) -lt $Deadline)

  throw $LastError
}

function Read-FilePrefixBytes {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [int] $Count
  )

  $ResolvedPath = (Resolve-Path -LiteralPath $Path).ProviderPath
  $Stream = [System.IO.File]::OpenRead($ResolvedPath)
  try {
    $Buffer = New-Object byte[] $Count
    $BytesRead = $Stream.Read($Buffer, 0, $Count)
    if ($BytesRead -eq $Count) {
      return $Buffer
    }
    if ($BytesRead -le 0) {
      return @()
    }
    return $Buffer[0..($BytesRead - 1)]
  } finally {
    $Stream.Dispose()
  }
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw ".NET 10 SDK is required for Windows tray package QA."
}

$Metadata = Get-Content -LiteralPath "apps/windows-tray/release/metadata.json" -Raw |
  ConvertFrom-Json
$RuntimeIdentifier = if (
  $env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or
  $env:PROCESSOR_ARCHITEW6432 -eq "ARM64"
) {
  "win-arm64"
} else {
  "win-x64"
}
$RuntimeIdentifiers = @("win-x64", "win-arm64")
$ArchivePaths = @(
  $RuntimeIdentifiers | ForEach-Object {
    "apps/windows-tray/.build/packages/YTM-Tray-$($Metadata.version)-$_.zip"
  }
)
$ArchivePath = "apps/windows-tray/.build/packages/YTM-Tray-$($Metadata.version)-$RuntimeIdentifier.zip"
$CombinedInstallerPath = "apps/windows-tray/.build/installer/YTM-Tray-$($Metadata.version)-Setup.exe"
$ExplorerArchiveCheck = Join-Path $PSScriptRoot "assert-explorer-archive-compatible.ps1"
$UpdateManifestPath = "apps/windows-tray/.build/update-manifest/YTM-Tray-update.json"
$QaTempRoot = (Get-Item -LiteralPath $env:TEMP).FullName
$ExtractRoot = Join-Path $QaTempRoot "ytm-tray-package-smoke"
$InstallRoot = Join-Path $QaTempRoot "ytm-tray-package-install"
$InstalledSetupPath = Join-Path $InstallRoot "YTMTray.Setup.exe"
$UninstallRegistryKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray"
$StartMenuFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\YTM Enhancer"
$TrayShortcutPath = Join-Path $StartMenuFolder "YTM Tray.lnk"
$UninstallShortcutPath = Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk"
$QuietSetupLogPath = Join-Path $ExtractRoot "quiet-setup.log"
$FailedSetupLogPath = Join-Path $ExtractRoot "failed-setup.log"

$env:CI = "true"

. "$PSScriptRoot\ensure-pnpm.ps1"
Ensure-Pnpm
Invoke-Pnpm install --frozen-lockfile
Invoke-Pnpm run windows-tray:package:win-x64
Invoke-Pnpm run windows-tray:package:win-arm64
Invoke-Pnpm run windows-tray:installer
$ManifestArguments = @()
foreach ($ArchivePath in $ArchivePaths) {
  $ManifestArguments += "--package=$ArchivePath"
}
$ManifestCommand = @(
  "run",
  "windows-tray:update-manifest",
  "--"
) + $ManifestArguments
Invoke-Pnpm @ManifestCommand
$ArchivePath =
  "apps/windows-tray/.build/packages/YTM-Tray-$($Metadata.version)-$RuntimeIdentifier.zip"

foreach ($CurrentRuntimeIdentifier in $RuntimeIdentifiers) {
  $CurrentArchivePath =
    "apps/windows-tray/.build/packages/YTM-Tray-$($Metadata.version)-$CurrentRuntimeIdentifier.zip"
  $CurrentPayloadRoot =
    "apps/windows-tray/.build/package-work/$CurrentRuntimeIdentifier/payload"
  Assert-PathExists $CurrentArchivePath
  Assert-PathExists $CurrentPayloadRoot
  Invoke-Native `
    -FilePath powershell.exe `
    -Arguments @(
      "-NoLogo",
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $ExplorerArchiveCheck,
      "-ArchivePath",
      $CurrentArchivePath,
      "-PayloadRoot",
      $CurrentPayloadRoot
    )
}
Assert-PathExists $CombinedInstallerPath
Assert-PathExists $UpdateManifestPath

Assert-Throws {
  Invoke-Native `
    -FilePath $CombinedInstallerPath `
    -Arguments @(
      "install",
      "--quiet",
      "--runtime-identifier",
      "invalid"
    )
} "quiet combined installer argument failure"

$UpdateManifest = Get-Content -LiteralPath $UpdateManifestPath -Raw |
  ConvertFrom-Json
$RuntimeAsset = $UpdateManifest.assets.PSObject.Properties[$RuntimeIdentifier].Value
Assert-Equal "windows-tray-v$($Metadata.version)" $UpdateManifest.tag "update manifest tag"
Assert-Equal "YTM-Tray-$($Metadata.version)-$RuntimeIdentifier.zip" $RuntimeAsset.name "update manifest asset"
if ($RuntimeAsset.sha256 -notmatch "^[a-f0-9]{64}$") {
  throw "Update manifest sha256 is invalid: $($RuntimeAsset.sha256)"
}

if (Test-Path -LiteralPath $ExtractRoot) {
  Remove-QaTree $ExtractRoot
}
if (Test-Path -LiteralPath $InstallRoot) {
  Remove-QaTree $InstallRoot
}
New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null

try {
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force
  $PackageSetupPath = Join-Path $ExtractRoot "YTMTray.Setup.exe"
  Assert-PathExists $PackageSetupPath
  Assert-PathExists (Join-Path $ExtractRoot "install-native-hosts.ps1")

  Invoke-Native `
    -FilePath $CombinedInstallerPath `
    -Arguments @(
      "install",
      "--quiet",
      "--install-root",
      $InstallRoot,
      "--log-path",
      $QuietSetupLogPath
    )

  Assert-PathExists (Join-Path $InstallRoot "YTMTray.exe")
  Assert-PathExists (Join-Path $InstallRoot "YTMTray.NativeHost.exe")
  Assert-PathExists $InstalledSetupPath
  Assert-PathExists (Join-Path $InstallRoot "com.gormanity.ytm_enhancer.tray.json")
  Assert-PathExists (Join-Path $InstallRoot "com.gormanity.ytm_enhancer.tray.firefox.json")
  Assert-PathMissing (Join-Path $InstallRoot "install-native-hosts.ps1")
  Assert-PathMissing (Join-Path $InstallRoot "uninstall-native-hosts.ps1")
  Assert-NoInstalledScripts $InstallRoot
  Assert-PathExists (Join-Path $InstallRoot "release.json")
  Assert-NoInstalledTrayProcess
  Assert-LogContains `
    -Path $QuietSetupLogPath `
    -Expected "post-install launch skipped for quiet setup"
  Assert-LogExcludes `
    -Path $QuietSetupLogPath `
    -Unexpected "launched installed YTM Tray process"
  Assert-PathExists (Join-Path $ExtractRoot "release.json")
  Assert-PathExists $UninstallRegistryKey
  Assert-Shortcut `
    -Path $TrayShortcutPath `
    -ExpectedTargetPath (Join-Path $InstallRoot "YTMTray.exe")
  Assert-Shortcut `
    -Path $UninstallShortcutPath `
    -ExpectedTargetPath $InstalledSetupPath `
    -ExpectedArguments "uninstall"

  $UninstallEntry = Get-ItemProperty -LiteralPath $UninstallRegistryKey
  Assert-Equal $InstallRoot $UninstallEntry.InstallLocation "uninstall install location"
  Assert-Equal $Metadata.version $UninstallEntry.DisplayVersion "uninstall display version"
  Assert-Equal `
    "`"$InstalledSetupPath`" uninstall" `
    $UninstallEntry.UninstallString `
    "uninstall command"
  Assert-Equal `
    "`"$InstalledSetupPath`" uninstall --quiet" `
    $UninstallEntry.QuietUninstallString `
    "quiet uninstall command"

  $PackageMetadata = Get-Content -LiteralPath (Join-Path $ExtractRoot "release.json") -Raw |
    ConvertFrom-Json
  $InstalledMetadata = Get-Content -LiteralPath (Join-Path $InstallRoot "release.json") -Raw |
    ConvertFrom-Json
  Assert-Equal $RuntimeIdentifier $PackageMetadata.runtimeIdentifier "package runtime"
  Assert-Equal $RuntimeIdentifier $InstalledMetadata.runtimeIdentifier "installed runtime"
  Assert-Equal $Metadata.version $PackageMetadata.version "package version"
  Assert-Equal $Metadata.version $InstalledMetadata.version "installed version"
  Assert-Equal $Metadata.githubReleaseListUrl $PackageMetadata.releaseListUrl "package release list URL"
  Assert-Equal "YTM-Tray-update.json" $PackageMetadata.updateManifestAssetName "package update manifest asset"

  $ExistingTrayBytes = Read-FilePrefixBytes (Join-Path $InstallRoot "YTMTray.exe") 16
  Set-Content -LiteralPath (Join-Path $ExtractRoot "YTMTray.exe") -Value "broken update payload"
  Assert-Throws {
    Invoke-Native `
      -FilePath $PackageSetupPath `
      -Arguments @(
        "install",
        "--quiet",
        "--launch-after-install",
        "--runtime-identifier",
        $RuntimeIdentifier,
        "--install-root",
        $InstallRoot,
        "--additional-allowed-origin",
        "not-a-valid-origin",
        "--log-path",
        $FailedSetupLogPath
      )
  } "invalid package reinstall"
  Assert-PathExists (Join-Path $InstallRoot "YTMTray.exe")
  Assert-PathExists (Join-Path $InstallRoot "YTMTray.NativeHost.exe")
  Assert-NoInstalledTrayProcess
  Assert-LogContains -Path $FailedSetupLogPath -Expected "setup failed:"
  Assert-LogExcludes `
    -Path $FailedSetupLogPath `
    -Unexpected "launched installed YTM Tray process"
  $RestoredTrayBytes = Read-FilePrefixBytes (Join-Path $InstallRoot "YTMTray.exe") 16
  Assert-Equal ($ExistingTrayBytes -join ",") ($RestoredTrayBytes -join ",") "restored tray executable"
} finally {
  $CleanupSetupPath = if (Test-Path -LiteralPath $InstalledSetupPath) {
    $InstalledSetupPath
  } else {
    Join-Path $ExtractRoot "YTMTray.Setup.exe"
  }
  if (Test-Path -LiteralPath $CleanupSetupPath) {
    Invoke-Native `
      -FilePath $CleanupSetupPath `
      -Arguments @(
        "uninstall",
        "--quiet",
        "--install-root",
        $InstallRoot
      )
    Wait-Uninstalled
  }

  Assert-PathMissing $InstallRoot
  Assert-PathMissing $UninstallRegistryKey
  Assert-PathMissing (Join-Path $StartMenuFolder "YTM Tray.lnk")
  Assert-PathMissing $UninstallShortcutPath

  if (Test-Path -LiteralPath $ExtractRoot) {
    Remove-QaTree $ExtractRoot
  }
}

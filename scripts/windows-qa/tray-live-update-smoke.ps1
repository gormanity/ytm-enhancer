param(
  [string] $BaselineVersion = "0.0.2",
  [string] $TargetVersion = "0.1.0",
  [string] $InstallRoot = (Join-Path $env:LOCALAPPDATA "YTM Enhancer\Tray"),
  [string] $WorkRoot = (Join-Path $env:TEMP "ytm-tray-live-update-smoke"),
  [switch] $KeepArtifacts
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$HostName = "com.gormanity.ytm_enhancer.tray"
$ReleaseDownloadRoot = "https://github.com/gormanity/ytm-enhancer/releases/download"
$RuntimeIdentifier = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
  "win-arm64"
} else {
  "win-x64"
}
$UninstallRegistryKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray"
$StartMenuFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\YTM Enhancer"
$ChromiumManifestPath = Join-Path $InstallRoot "$HostName.json"
$FirefoxManifestPath = Join-Path $InstallRoot "$HostName.firefox.json"
$NativeHostPath = Join-Path $InstallRoot "YTMTray.NativeHost.exe"
$ReleaseMetadataPath = Join-Path $InstallRoot "release.json"
$TrayPath = Join-Path $InstallRoot "YTMTray.exe"
$UninstallerPath = Join-Path $InstallRoot "uninstall-native-hosts.ps1"
$LaunchResultPath = Join-Path $WorkRoot "launch.json"
$UpdateResultPath = Join-Path $WorkRoot "update-ui.json"
$TrayLogPath = Join-Path $WorkRoot "tray.log"
$NativeRegistryKeys = @{
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" = $ChromiumManifestPath
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName" = $ChromiumManifestPath
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName" = $FirefoxManifestPath
}

function ConvertTo-PowerShellLiteral {
  param([Parameter(Mandatory = $true)][string] $Value)
  return "'" + $Value.Replace("'", "''") + "'"
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

function Remove-QaTree {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Get-ActiveDesktopSessionId {
  $Explorer = Get-Process explorer -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if ($null -eq $Explorer) {
    throw "No active explorer.exe desktop session is available."
  }

  return $Explorer.SessionId
}

function Invoke-InteractivePowerShell {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [string[]] $ScriptLines,
    [Parameter(Mandatory = $true)]
    [string] $ResultPath,
    [int] $TimeoutSeconds = 120
  )

  $TaskName = "YTMEnhancerTrayLiveUpdate-$Name-$PID"
  $ScriptPath = Join-Path $env:TEMP "$TaskName.ps1"
  $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

  if (Test-Path -LiteralPath $ResultPath) {
    Remove-Item -LiteralPath $ResultPath -Force
  }

  Set-Content -LiteralPath $ScriptPath -Value $ScriptLines -Encoding UTF8

  try {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    $Action = New-ScheduledTaskAction `
      -Execute "powershell.exe" `
      -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
    $Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
    $Principal = New-ScheduledTaskPrincipal `
      -UserId $Identity `
      -LogonType Interactive `
      -RunLevel Limited
    $Settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $Action `
      -Trigger $Trigger `
      -Principal $Principal `
      -Settings $Settings `
      -Force |
      Out-Null

    Start-ScheduledTask -TaskName $TaskName

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $Deadline -and -not (Test-Path -LiteralPath $ResultPath)) {
      Start-Sleep -Milliseconds 500
    }

    if (-not (Test-Path -LiteralPath $ResultPath)) {
      $TaskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
      throw "$Name did not create $ResultPath. LastTaskResult=$($TaskInfo.LastTaskResult)"
    }

    $Payload = Get-Content -LiteralPath $ResultPath -Raw | ConvertFrom-Json
    if (-not $Payload.ok) {
      throw "$Name failed: $($Payload.error)`n$($Payload.scriptStack)"
    }

    return $Payload
  } finally {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    if (Test-Path -LiteralPath $ScriptPath) {
      Remove-Item -LiteralPath $ScriptPath -Force
    }
  }
}

function New-ResultWrapper {
  param(
    [Parameter(Mandatory = $true)][string] $ResultPath,
    [Parameter(Mandatory = $true)][string[]] $BodyLines
  )

  return @(
    '$ErrorActionPreference = "Stop"',
    "`$ResultPath = $(ConvertTo-PowerShellLiteral $ResultPath)",
    "try {"
  ) + $BodyLines + @(
    "} catch {",
    '  $Payload = @{',
    '    ok = $false',
    '    error = $_.Exception.ToString()',
    '    scriptStack = $_.ScriptStackTrace',
    '  }',
    "}",
    '$Json = $Payload | ConvertTo-Json -Depth 8 -Compress',
    '[IO.File]::WriteAllText($ResultPath, $Json)'
  )
}

function Get-ReleaseAssetUrl {
  param(
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $AssetName
  )

  return "$ReleaseDownloadRoot/windows-tray-v$Version/$AssetName"
}

function Save-ReleaseAsset {
  param(
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $AssetName,
    [Parameter(Mandatory = $true)][string] $DestinationPath
  )

  $AssetUrl = Get-ReleaseAssetUrl -Version $Version -AssetName $AssetName
  Write-Host "Downloading $AssetUrl"
  Invoke-WebRequest -UseBasicParsing -Uri $AssetUrl -OutFile $DestinationPath
}

function Expand-ReleasePackage {
  param(
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $ArchivePath
  )

  $ExtractRoot = Join-Path $WorkRoot "extract-$Version"
  Remove-QaTree -Path $ExtractRoot
  New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force

  Assert-PathExists (Join-Path $ExtractRoot "install-native-hosts.ps1")
  Assert-PathExists (Join-Path $ExtractRoot "uninstall-native-hosts.ps1")
  Assert-PathExists (Join-Path $ExtractRoot "release.json")
  Assert-PathExists (Join-Path $ExtractRoot "YTMTray.exe")
  Assert-PathExists (Join-Path $ExtractRoot "YTMTray.NativeHost.exe")

  return $ExtractRoot
}

function Install-ReleasePackage {
  param(
    [Parameter(Mandatory = $true)][string] $ExtractRoot,
    [Parameter(Mandatory = $true)][string] $Version
  )

  Push-Location $ExtractRoot
  try {
    & .\install-native-hosts.ps1 -RuntimeIdentifier $RuntimeIdentifier
  } finally {
    Pop-Location
  }

  Assert-InstalledRelease -Version $Version
}

function Assert-AuthenticodeSigner {
  param([Parameter(Mandatory = $true)][string] $Path)

  $Signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($null -eq $Signature.SignerCertificate) {
    throw "Expected Authenticode signer on $Path"
  }
  if ($Signature.SignerCertificate.Subject -notlike "*YTM Tray Beta Self-Signed*") {
    throw "Unexpected signer for ${Path}: $($Signature.SignerCertificate.Subject)"
  }
}

function Assert-InstalledRelease {
  param([Parameter(Mandatory = $true)][string] $Version)

  Assert-PathExists $TrayPath
  Assert-PathExists $NativeHostPath
  Assert-PathExists $ChromiumManifestPath
  Assert-PathExists $FirefoxManifestPath
  Assert-PathExists $UninstallerPath
  Assert-PathExists $ReleaseMetadataPath
  Assert-PathExists $UninstallRegistryKey
  Assert-PathExists (Join-Path $StartMenuFolder "YTM Tray.lnk")
  Assert-PathExists (Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk")

  Assert-AuthenticodeSigner $TrayPath
  Assert-AuthenticodeSigner $NativeHostPath

  $ReleaseMetadata = Get-Content -LiteralPath $ReleaseMetadataPath -Raw |
    ConvertFrom-Json
  Assert-Equal $Version $ReleaseMetadata.version "installed release metadata version"
  Assert-Equal $RuntimeIdentifier $ReleaseMetadata.runtimeIdentifier "installed runtime"

  $UninstallEntry = Get-ItemProperty -LiteralPath $UninstallRegistryKey
  Assert-Equal $InstallRoot $UninstallEntry.InstallLocation "uninstall install location"
  Assert-Equal $Version $UninstallEntry.DisplayVersion "uninstall display version"

  foreach ($RegistryKey in $NativeRegistryKeys.Keys) {
    Assert-PathExists $RegistryKey
    $ManifestPath = (Get-Item -LiteralPath $RegistryKey).GetValue("")
    Assert-Equal $NativeRegistryKeys[$RegistryKey] $ManifestPath "$RegistryKey manifest path"
  }
}

function Wait-InstalledRelease {
  param(
    [Parameter(Mandatory = $true)][string] $Version,
    [int] $TimeoutSeconds = 120
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $ObservedVersion = "<missing>"
  do {
    if (Test-Path -LiteralPath $ReleaseMetadataPath) {
      try {
        $ReleaseMetadata = Get-Content -LiteralPath $ReleaseMetadataPath -Raw |
          ConvertFrom-Json
        $ObservedVersion = $ReleaseMetadata.version
        if ($ObservedVersion -eq $Version) {
          Assert-InstalledRelease -Version $Version
          return
        }
      } catch {
        $ObservedVersion = $_.Exception.Message
      }
    }

    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $Deadline)

  throw "Timed out waiting for YTM Tray $Version to be installed. Observed: $ObservedVersion"
}

function Invoke-InstalledUninstaller {
  if (Test-Path -LiteralPath $UninstallerPath) {
    & $UninstallerPath -Quiet
  }
}

function Assert-Uninstalled {
  Assert-PathMissing $InstallRoot
  Assert-PathMissing $UninstallRegistryKey
  Assert-PathMissing (Join-Path $StartMenuFolder "YTM Tray.lnk")
  Assert-PathMissing (Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk")

  foreach ($RegistryKey in $NativeRegistryKeys.Keys) {
    Assert-PathMissing $RegistryKey
  }
}

function Start-ReleasedTrayApp {
  $LaunchLines = New-ResultWrapper `
    -ResultPath $LaunchResultPath `
    -BodyLines @(
      "`$ExecutablePath = $(ConvertTo-PowerShellLiteral $TrayPath)",
      "`$LogPath = $(ConvertTo-PowerShellLiteral $TrayLogPath)",
      '$env:YTM_TRAY_LOG_PATH = $LogPath',
      '$Process = Start-Process -FilePath $ExecutablePath -PassThru',
      'Start-Sleep -Milliseconds 1500',
      '$StartedProcess = Get-Process -Id $Process.Id -ErrorAction Stop',
      '$Payload = @{',
      '  ok = $true',
      '  pid = $StartedProcess.Id',
      '  sessionId = $StartedProcess.SessionId',
      '}'
    )

  return Invoke-InteractivePowerShell `
    -Name "launch" `
    -ScriptLines $LaunchLines `
    -ResultPath $LaunchResultPath `
    -TimeoutSeconds 60
}

function Invoke-LiveUpdateUi {
  $UpdateLines = New-ResultWrapper `
    -ResultPath $UpdateResultPath `
    -BodyLines @(
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName UIAutomationClient',
      'Add-Type -AssemblyName UIAutomationTypes',
      '$NativeInputSource = @''',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class NativeInput {',
      '  [DllImport("user32.dll")]',
      '  public static extern bool SetCursorPos(int X, int Y);',
      '  [DllImport("user32.dll")]',
      '  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);',
      '  [DllImport("user32.dll")]',
      '  public static extern bool SetForegroundWindow(IntPtr hWnd);',
      '}',
      '''@',
      'Add-Type -TypeDefinition $NativeInputSource',
      "`$TargetVersion = $(ConvertTo-PowerShellLiteral $TargetVersion)",
      'function Get-Elements {',
      '  $Root = [System.Windows.Automation.AutomationElement]::RootElement',
      '  return $Root.FindAll(',
      '    [System.Windows.Automation.TreeScope]::Descendants,',
      '    [System.Windows.Automation.Condition]::TrueCondition',
      '  )',
      '}',
      'function Find-ElementByName {',
      '  param(',
      '    [Parameter(Mandatory = $true)] $Root,',
      '    [Parameter(Mandatory = $true)][string] $Name',
      '  )',
      '  $Condition = New-Object System.Windows.Automation.PropertyCondition(',
      '    [System.Windows.Automation.AutomationElement]::NameProperty,',
      '    $Name',
      '  )',
      '  return $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $Condition)',
      '}',
      'function Wait-ElementByName {',
      '  param(',
      '    [Parameter(Mandatory = $true)] $Root,',
      '    [Parameter(Mandatory = $true)][string] $Name,',
      '    [int] $TimeoutMilliseconds = 8000',
      '  )',
      '  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)',
      '  do {',
      '    $Element = Find-ElementByName $Root $Name',
      '    if ($null -ne $Element) { return $Element }',
      '    Start-Sleep -Milliseconds 250',
      '  } while ((Get-Date) -lt $Deadline)',
      '  return $null',
      '}',
      'function Find-RootButtonByName {',
      '  param([Parameter(Mandatory = $true)][string] $Name)',
      '  foreach ($Element in Get-Elements) {',
      '    if ($Element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and',
      '        $Element.Current.Name -like "*$Name*") {',
      '      return $Element',
      '    }',
      '  }',
      '  return $null',
      '}',
      'function Wait-RootButtonByName {',
      '  param(',
      '    [Parameter(Mandatory = $true)][string] $Name,',
      '    [int] $TimeoutMilliseconds = 8000',
      '  )',
      '  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)',
      '  do {',
      '    $Button = Find-RootButtonByName $Name',
      '    if ($null -ne $Button) { return $Button }',
      '    Start-Sleep -Milliseconds 250',
      '  } while ((Get-Date) -lt $Deadline)',
      '  return $null',
      '}',
      'function Find-RootWindowByName {',
      '  param([Parameter(Mandatory = $true)][string] $Name)',
      '  $Root = [System.Windows.Automation.AutomationElement]::RootElement',
      '  $WindowCondition = New-Object System.Windows.Automation.PropertyCondition(',
      '    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,',
      '    [System.Windows.Automation.ControlType]::Window',
      '  )',
      '  foreach ($Window in $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $WindowCondition)) {',
      '    if ($Window.Current.Name -like "*$Name*") { return $Window }',
      '  }',
      '  return $null',
      '}',
      'function Wait-RootWindowByName {',
      '  param(',
      '    [Parameter(Mandatory = $true)][string] $Name,',
      '    [int] $TimeoutMilliseconds = 8000',
      '  )',
      '  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)',
      '  do {',
      '    $Window = Find-RootWindowByName $Name',
      '    if ($null -ne $Window) { return $Window }',
      '    Start-Sleep -Milliseconds 250',
      '  } while ((Get-Date) -lt $Deadline)',
      '  return $null',
      '}',
      'function Wait-DialogButton {',
      '  param(',
      '    [Parameter(Mandatory = $true)][string] $WindowName,',
      '    [Parameter(Mandatory = $true)][string] $ButtonName,',
      '    [int] $TimeoutMilliseconds = 120000',
      '  )',
      '  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)',
      '  do {',
      '    $Window = Find-RootWindowByName $WindowName',
      '    if ($null -ne $Window) {',
      '      $Button = Find-ElementByName $Window $ButtonName',
      '      if ($null -ne $Button) { return $Button }',
      '    }',
      '    Start-Sleep -Milliseconds 250',
      '  } while ((Get-Date) -lt $Deadline)',
      '  return $null',
      '}',
      'function Test-VisibleWindow {',
      '  param([Parameter(Mandatory = $true)] $Window)',
      '  $Rect = $Window.Current.BoundingRectangle',
      '  return -not $Window.Current.IsOffscreen -and $Rect.Width -gt 0 -and $Rect.Height -gt 0',
      '}',
      'function Get-VisibleElementNames {',
      '  $Names = New-Object System.Collections.Generic.List[string]',
      '  foreach ($Element in Get-Elements) {',
      '    if ($Element.Current.Name) { $Names.Add($Element.Current.Name) }',
      '  }',
      '  return $Names',
      '}',
      'function Click-Element {',
      '  param(',
      '    [Parameter(Mandatory = $true)] $Element,',
      '    [double] $XFraction = 0.5,',
      '    [double] $YFraction = 0.5,',
      '    [ValidateSet("Left", "Right")]',
      '    [string] $Button = "Left"',
      '  )',
      '  $Rect = $Element.Current.BoundingRectangle',
      '  if ($Rect.Width -le 0 -or $Rect.Height -le 0) {',
      '    throw "Element is not clickable: $($Element.Current.Name)"',
      '  }',
      '  try {',
      '    $ClickablePoint = $Element.GetClickablePoint()',
      '    $X = [int]$ClickablePoint.X',
      '    $Y = [int]$ClickablePoint.Y',
      '  } catch {',
      '    $X = [int]($Rect.X + ($Rect.Width * $XFraction))',
      '    $Y = [int]($Rect.Y + ($Rect.Height * $YFraction))',
      '  }',
      '  [NativeInput]::SetCursorPos($X, $Y) | Out-Null',
      '  Start-Sleep -Milliseconds 100',
      '  if ($Button -eq "Right") {',
      '    [NativeInput]::mouse_event(8, 0, 0, 0, [UIntPtr]::Zero)',
      '    [NativeInput]::mouse_event(16, 0, 0, 0, [UIntPtr]::Zero)',
      '    return',
      '  }',
      '  [NativeInput]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)',
      '  [NativeInput]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)',
      '}',
      'function Invoke-Element {',
      '  param([Parameter(Mandatory = $true)] $Element)',
      '  try {',
      '    $Pattern = $Element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)',
      '    $Pattern.Invoke()',
      '    Start-Sleep -Milliseconds 300',
      '    return $true',
      '  } catch {',
      '    return $false',
      '  }',
      '}',
      'function Send-ElementKeys {',
      '  param(',
      '    [Parameter(Mandatory = $true)] $Element,',
      '    [Parameter(Mandatory = $true)][string] $Keys',
      '  )',
      '  try {',
      '    $Element.SetFocus()',
      '    Start-Sleep -Milliseconds 100',
      '  } catch {}',
      '  [System.Windows.Forms.SendKeys]::SendWait($Keys)',
      '  Start-Sleep -Milliseconds 300',
      '}',
      'function Activate-Window {',
      '  param([Parameter(Mandatory = $true)] $Window)',
      '  $Handle = $Window.Current.NativeWindowHandle',
      '  if ($Handle -eq 0) { return }',
      '  [NativeInput]::SetForegroundWindow([IntPtr]$Handle) | Out-Null',
      '  Start-Sleep -Milliseconds 150',
      '}',
      'function Open-TrayPopup {',
      '  $PopupWindow = Find-RootWindowByName "YTM Tray"',
      '  if ($null -ne $PopupWindow -and (Test-VisibleWindow $PopupWindow)) {',
      '    Activate-Window $PopupWindow',
      '    return $PopupWindow',
      '  }',
      '  $TrayButton = Wait-RootButtonByName "YTM Enhancer" 5000',
      '  if ($null -eq $TrayButton) {',
      '    $HiddenIconsButton = Find-RootButtonByName "Show Hidden Icons"',
      '    if ($null -ne $HiddenIconsButton) {',
      '      Click-Element $HiddenIconsButton',
      '      Start-Sleep -Milliseconds 900',
      '      $TrayButton = Wait-RootButtonByName "YTM Enhancer" 8000',
      '    }',
      '  }',
      '  if ($null -eq $TrayButton) {',
      '    throw "YTM Enhancer tray icon was not found. Visible elements: $((Get-VisibleElementNames) -join '', '')"',
      '  }',
      '  $OpenAttempts = @(',
      '    "invoke",',
      '    "enter",',
      '    "space",',
      '    "click"',
      '  )',
      '  foreach ($OpenAttempt in $OpenAttempts) {',
      '    if ($OpenAttempt -eq "invoke") {',
      '      [void](Invoke-Element $TrayButton)',
      '    } elseif ($OpenAttempt -eq "enter") {',
      '      Send-ElementKeys $TrayButton "{ENTER}"',
      '    } elseif ($OpenAttempt -eq "space") {',
      '      Send-ElementKeys $TrayButton "{SPACE}"',
      '    } else {',
      '      Click-Element $TrayButton',
      '    }',
      '    $PopupWindow = Wait-RootWindowByName "YTM Tray" 2500',
      '    if ($null -ne $PopupWindow -and (Test-VisibleWindow $PopupWindow)) {',
      '      Activate-Window $PopupWindow',
      '      return $PopupWindow',
      '    }',
      '  }',
      '  return $null',
      '}',
      'function Open-TrayContextMenu {',
      '  $TrayButton = Wait-RootButtonByName "YTM Enhancer" 5000',
      '  if ($null -eq $TrayButton) {',
      '    $HiddenIconsButton = Find-RootButtonByName "Show Hidden Icons"',
      '    if ($null -ne $HiddenIconsButton) {',
      '      Click-Element $HiddenIconsButton',
      '      Start-Sleep -Milliseconds 900',
      '      $TrayButton = Wait-RootButtonByName "YTM Enhancer" 8000',
      '    }',
      '  }',
      '  if ($null -eq $TrayButton) {',
      '    throw "YTM Enhancer tray icon was not found for context menu. Visible elements: $((Get-VisibleElementNames) -join '', '')"',
      '  }',
      '  Click-Element $TrayButton 0.5 0.5 "Right"',
      '  Start-Sleep -Milliseconds 500',
      '  $InstallAction = Wait-RootElementByName "Install Update $TargetVersion" 1500',
      '  $CheckAction = Wait-RootElementByName "Check for Updates" 1500',
      '  if ($null -eq $InstallAction -and $null -eq $CheckAction) {',
      '    Send-ElementKeys $TrayButton "+{F10}"',
      '  }',
      '}',
      'function Wait-RootElementByName {',
      '  param(',
      '    [Parameter(Mandatory = $true)][string] $Name,',
      '    [int] $TimeoutMilliseconds = 8000',
      '  )',
      '  $Root = [System.Windows.Automation.AutomationElement]::RootElement',
      '  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)',
      '  do {',
      '    $Element = Find-ElementByName $Root $Name',
      '    if ($null -ne $Element) { return $Element }',
      '    Start-Sleep -Milliseconds 250',
      '  } while ((Get-Date) -lt $Deadline)',
      '  return $null',
      '}',
      '$PopupWindow = Open-TrayPopup',
      '$ActionName = "Install Update $TargetVersion"',
      '$ActionSurface = "popup"',
      'if ($null -ne $PopupWindow) {',
      '  $UpdateElement = Wait-ElementByName $PopupWindow $ActionName 10000',
      '  if ($null -eq $UpdateElement) {',
      '    $ActionName = "Check for Updates"',
      '    $UpdateElement = Wait-ElementByName $PopupWindow $ActionName 10000',
      '  }',
      '} else {',
      '  $UpdateElement = $null',
      '}',
      'if ($null -eq $UpdateElement) {',
      '  $ActionSurface = "popup root"',
      '  $ActionName = "Install Update $TargetVersion"',
      '  $UpdateElement = Wait-RootElementByName $ActionName 3000',
      '  if ($null -eq $UpdateElement) {',
      '    $ActionName = "Check for Updates"',
      '    $UpdateElement = Wait-RootElementByName $ActionName 3000',
      '  }',
      '}',
      'if ($null -eq $UpdateElement) {',
      '  $ActionSurface = "context menu"',
      '  Open-TrayContextMenu',
      '  $ActionName = "Install Update $TargetVersion"',
      '  $UpdateElement = Wait-RootElementByName $ActionName 10000',
      '  if ($null -eq $UpdateElement) {',
      '    $ActionName = "Check for Updates"',
      '    $UpdateElement = Wait-RootElementByName $ActionName 10000',
      '  }',
      '}',
      'if ($null -eq $UpdateElement) {',
      '  $ProcessState = Get-Process YTMTray -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id',
      '  throw "Update action was not found. YTMTray processes: $($ProcessState -join '', ''). Visible elements: $((Get-VisibleElementNames) -join '', '')"',
      '}',
      'Click-Element $UpdateElement',
      '$YesButton = Wait-DialogButton "Update YTM Tray" "Yes" 45000',
      'if ($null -eq $YesButton) {',
      '  throw "Update confirmation Yes button was not shown. Visible elements: $((Get-VisibleElementNames) -join '', '')"',
      '}',
      'Click-Element $YesButton',
      '$OkButton = Wait-DialogButton "Update YTM Tray" "OK" 120000',
      'if ($null -eq $OkButton) {',
      '  throw "Verified update OK button was not shown. Visible elements: $((Get-VisibleElementNames) -join '', '')"',
      '}',
      'Click-Element $OkButton',
      '$Payload = @{',
      '  ok = $true',
      '  clickedAction = $ActionName',
      '  actionSurface = $ActionSurface',
      '}'
    )

  return Invoke-InteractivePowerShell `
    -Name "update" `
    -ScriptLines $UpdateLines `
    -ResultPath $UpdateResultPath `
    -TimeoutSeconds 180
}

Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force

Remove-QaTree -Path $WorkRoot
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

try {
  Invoke-InstalledUninstaller
  Remove-QaTree -Path $InstallRoot

  $BaselineArchiveName = "YTM-Tray-$BaselineVersion-$RuntimeIdentifier.zip"
  $BaselineArchivePath = Join-Path $WorkRoot $BaselineArchiveName
  Save-ReleaseAsset `
    -Version $BaselineVersion `
    -AssetName $BaselineArchiveName `
    -DestinationPath $BaselineArchivePath
  $BaselineExtractRoot = Expand-ReleasePackage `
    -Version $BaselineVersion `
    -ArchivePath $BaselineArchivePath

  Write-Host "Installing YTM Tray $BaselineVersion from published release."
  Install-ReleasePackage -ExtractRoot $BaselineExtractRoot -Version $BaselineVersion

  $ActiveSessionId = Get-ActiveDesktopSessionId
  Write-Host "Launching YTM Tray $BaselineVersion in desktop session $ActiveSessionId."
  $Launch = Start-ReleasedTrayApp
  Assert-Equal $ActiveSessionId $Launch.sessionId "tray process session"

  Write-Host "Driving the tray update UI from $BaselineVersion to $TargetVersion."
  $Update = Invoke-LiveUpdateUi

  Wait-InstalledRelease -Version $TargetVersion

  Write-Host "Uninstalling YTM Tray $TargetVersion from installed uninstaller."
  Invoke-InstalledUninstaller
  Assert-Uninstalled

  Write-Host "Windows tray live-update smoke passed: $BaselineVersion -> $TargetVersion ($RuntimeIdentifier)."
  Write-Host "Clicked update action: $($Update.clickedAction) via $($Update.actionSurface)"
} finally {
  Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
    Stop-Process -Force

  if (Test-Path -LiteralPath $UninstallerPath) {
    & $UninstallerPath -Quiet
  }

  if (-not $KeepArtifacts) {
    Remove-QaTree -Path $WorkRoot
  }
}

param(
  [string] $InstallRoot = (Join-Path $env:TEMP "ytm-enhancer-tray-visual-install"),
  [string] $ArtifactRoot = (Join-Path $env:TEMP "ytm-enhancer-tray-visual-artifacts"),
  [int] $TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

function ConvertTo-PowerShellLiteral {
  param([Parameter(Mandatory = $true)][string] $Value)
  return "'" + $Value.Replace("'", "''") + "'"
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
    [string] $ResultPath
  )

  $TaskName = "YTMEnhancerTrayVisual-$Name-$PID"
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
      -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

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

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw ".NET 10 SDK is required for Windows tray visual QA."
}

$SdkMajorVersions = dotnet --list-sdks |
  ForEach-Object { ($_ -split "\.")[0] } |
  Where-Object { $_ -match "^\d+$" } |
  ForEach-Object { [int] $_ }

if (-not ($SdkMajorVersions | Where-Object { $_ -ge 10 })) {
  throw ".NET 10 SDK or newer is required for Windows tray visual QA."
}

$RuntimeIdentifier = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
  "win-arm64"
} else {
  "win-x64"
}
$ExecutablePath = Join-Path $InstallRoot "YTMTray.exe"
$NativeHostExecutablePath = Join-Path $InstallRoot "YTMTray.NativeHost.exe"
$DesktopScreenshotPath = Join-Path $ArtifactRoot "tray-desktop.png"
$OverflowScreenshotPath = Join-Path $ArtifactRoot "tray-overflow.png"
$PopupScreenshotPath = Join-Path $ArtifactRoot "tray-popup.png"
$LaunchResultPath = Join-Path $ArtifactRoot "launch.json"
$VisualResultPath = Join-Path $ArtifactRoot "visual.json"
$ActiveSessionId = Get-ActiveDesktopSessionId

New-Item -ItemType Directory -Force -Path $ArtifactRoot | Out-Null
Remove-Item -Path (Join-Path $ArtifactRoot "*") `
  -Force `
  -Recurse `
  -ErrorAction SilentlyContinue
Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force

try {
  & .\apps\windows-tray\scripts\install-native-hosts.ps1 `
    -RuntimeIdentifier $RuntimeIdentifier `
    -InstallRoot $InstallRoot

  if (-not (Test-Path -LiteralPath $ExecutablePath)) {
    throw "Expected tray executable to exist: $ExecutablePath"
  }
  if (-not (Test-Path -LiteralPath $NativeHostExecutablePath)) {
    throw "Expected native host executable to exist: $NativeHostExecutablePath"
  }

  $LaunchLines = New-ResultWrapper `
    -ResultPath $LaunchResultPath `
    -BodyLines @(
      "`$ExecutablePath = $(ConvertTo-PowerShellLiteral $ExecutablePath)",
      '$env:YTM_TRAY_VISUAL_DEMO = "1"',
      '$Process = Start-Process -FilePath $ExecutablePath -PassThru',
      'Start-Sleep -Milliseconds 1500',
      '$StartedProcess = Get-Process -Id $Process.Id -ErrorAction Stop',
      '$Payload = @{',
      '  ok = $true',
      '  pid = $StartedProcess.Id',
      '  sessionId = $StartedProcess.SessionId',
      '}'
    )

  $Launch = Invoke-InteractivePowerShell `
    -Name "launch" `
    -ScriptLines $LaunchLines `
    -ResultPath $LaunchResultPath

  Assert-Equal $ActiveSessionId $Launch.sessionId "tray process session"

  $VisualLines = New-ResultWrapper `
    -ResultPath $VisualResultPath `
    -BodyLines @(
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
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
      '}',
      '''@',
      'Add-Type -TypeDefinition $NativeInputSource',
      "`$DesktopScreenshotPath = $(ConvertTo-PowerShellLiteral $DesktopScreenshotPath)",
      "`$OverflowScreenshotPath = $(ConvertTo-PowerShellLiteral $OverflowScreenshotPath)",
      "`$PopupScreenshotPath = $(ConvertTo-PowerShellLiteral $PopupScreenshotPath)",
      'function Save-Screenshot {',
      '  param([Parameter(Mandatory = $true)][string] $Path)',
      '  $Bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
      '  $Bitmap = New-Object System.Drawing.Bitmap $Bounds.Width, $Bounds.Height',
      '  $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)',
      '  try {',
      '    $Graphics.CopyFromScreen($Bounds.Location, [System.Drawing.Point]::Empty, $Bounds.Size)',
      '    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)',
      '  } finally {',
      '    $Graphics.Dispose()',
      '    $Bitmap.Dispose()',
      '  }',
      '}',
      'function Save-RectangleScreenshot {',
      '  param(',
      '    [Parameter(Mandatory = $true)][string] $Path,',
      '    [Parameter(Mandatory = $true)] $Rect,',
      '    [int] $Padding = 0',
      '  )',
      '  $ScreenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
      '  $Left = [Math]::Max($ScreenBounds.Left, [int][Math]::Floor($Rect.X) - $Padding)',
      '  $Top = [Math]::Max($ScreenBounds.Top, [int][Math]::Floor($Rect.Y) - $Padding)',
      '  $Right = [Math]::Min($ScreenBounds.Right, [int][Math]::Ceiling($Rect.Right) + $Padding)',
      '  $Bottom = [Math]::Min($ScreenBounds.Bottom, [int][Math]::Ceiling($Rect.Bottom) + $Padding)',
      '  $Width = $Right - $Left',
      '  $Height = $Bottom - $Top',
      '  if ($Width -le 0 -or $Height -le 0) {',
      '    throw "Invalid screenshot rectangle: $Rect"',
      '  }',
      '  $Bitmap = New-Object System.Drawing.Bitmap $Width, $Height',
      '  $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)',
      '  try {',
      '    $Graphics.CopyFromScreen($Left, $Top, 0, 0, $Bitmap.Size)',
      '    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)',
      '  } finally {',
      '    $Graphics.Dispose()',
      '    $Bitmap.Dispose()',
      '  }',
      '}',
      'function Get-Buttons {',
      '  $Root = [System.Windows.Automation.AutomationElement]::RootElement',
      '  $Condition = New-Object System.Windows.Automation.PropertyCondition(',
      '    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,',
      '    [System.Windows.Automation.ControlType]::Button',
      '  )',
      '  return $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $Condition)',
      '}',
      'function Find-ButtonByName {',
      '  param([Parameter(Mandatory = $true)][string] $Name)',
      '  foreach ($Button in Get-Buttons) {',
      '    if ($Button.Current.Name -like "*$Name*") { return $Button }',
      '  }',
      '  return $null',
      '}',
      'function Wait-ButtonByName {',
      '  param(',
      '    [Parameter(Mandatory = $true)][string] $Name,',
      '    [int] $TimeoutMilliseconds = 8000',
      '  )',
      '  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)',
      '  do {',
      '    $Button = Find-ButtonByName $Name',
      '    if ($null -ne $Button) { return $Button }',
      '    Start-Sleep -Milliseconds 250',
      '  } while ((Get-Date) -lt $Deadline)',
      '  return $null',
      '}',
      'function Get-VisibleButtonNames {',
      '  $Names = New-Object System.Collections.Generic.List[string]',
      '  foreach ($Button in Get-Buttons) {',
      '    if ($Button.Current.Name) { $Names.Add($Button.Current.Name) }',
      '  }',
      '  return $Names',
      '}',
      'function Click-Element {',
      '  param([Parameter(Mandatory = $true)] $Element)',
      '  $Rect = $Element.Current.BoundingRectangle',
      '  if ($Rect.Width -le 0 -or $Rect.Height -le 0) {',
      '    throw "Element is not clickable: $($Element.Current.Name)"',
      '  }',
      '  $X = [int]($Rect.X + ($Rect.Width / 2))',
      '  $Y = [int]($Rect.Y + ($Rect.Height / 2))',
      '  [NativeInput]::SetCursorPos($X, $Y) | Out-Null',
      '  Start-Sleep -Milliseconds 100',
      '  [NativeInput]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)',
      '  [NativeInput]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)',
      '}',
      'function Find-WindowByName {',
      '  param([Parameter(Mandatory = $true)][string] $Name)',
      '  $Root = [System.Windows.Automation.AutomationElement]::RootElement',
      '  $Condition = New-Object System.Windows.Automation.PropertyCondition(',
      '    [System.Windows.Automation.AutomationElement]::NameProperty,',
      '    $Name',
      '  )',
      '  return $Root.FindFirst([System.Windows.Automation.TreeScope]::Children, $Condition)',
      '}',
      'Save-Screenshot $DesktopScreenshotPath',
      '$TrayButton = Wait-ButtonByName "YTM Enhancer" 5000',
      '$OpenedOverflow = $false',
      'if ($null -eq $TrayButton) {',
      '  $HiddenIconsButton = Find-ButtonByName "Show Hidden Icons"',
      '  if ($null -ne $HiddenIconsButton) {',
      '    Click-Element $HiddenIconsButton',
      '    $OpenedOverflow = $true',
      '    Start-Sleep -Milliseconds 900',
      '    Save-Screenshot $OverflowScreenshotPath',
      '    $TrayButton = Wait-ButtonByName "YTM Enhancer" 8000',
      '  }',
      '}',
      'if ($null -eq $TrayButton) {',
      '  throw "YTM Enhancer tray icon was not found. Visible buttons: $((Get-VisibleButtonNames) -join '', '')"',
      '}',
      'Click-Element $TrayButton',
      'Start-Sleep -Milliseconds 900',
      '$PopupWindow = Find-WindowByName "YTM Tray"',
      'if ($null -eq $PopupWindow) {',
      '  throw "YTM Tray popup window was not found after clicking tray icon."',
      '}',
      'Save-RectangleScreenshot -Path $PopupScreenshotPath -Rect $PopupWindow.Current.BoundingRectangle -Padding 2',
      '$Payload = @{',
      '  ok = $true',
      '  openedOverflow = $OpenedOverflow',
      '  trayName = $TrayButton.Current.Name',
      '  popupName = $PopupWindow.Current.Name',
      '  screenshots = @{',
      '    desktop = $DesktopScreenshotPath',
      '    overflow = $(if (Test-Path -LiteralPath $OverflowScreenshotPath) { $OverflowScreenshotPath } else { $null })',
      '    popup = $PopupScreenshotPath',
      '  }',
      '}'
    )

  $Visual = Invoke-InteractivePowerShell `
    -Name "visual" `
    -ScriptLines $VisualLines `
    -ResultPath $VisualResultPath

  Write-Output "Windows tray visual smoke passed."
  Write-Output "tray process session: $($Launch.sessionId)"
  Write-Output "tray icon: $($Visual.trayName)"
  Write-Output "popup: $($Visual.popupName)"
  Write-Output "screenshots:"
  Write-Output "  desktop: $DesktopScreenshotPath"
  if ($Visual.screenshots.overflow) {
    Write-Output "  overflow: $OverflowScreenshotPath"
  }
  Write-Output "  popup: $PopupScreenshotPath"
} finally {
  Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
    Stop-Process -Force
  & .\apps\windows-tray\scripts\uninstall-native-hosts.ps1 `
    -InstallRoot $InstallRoot
}

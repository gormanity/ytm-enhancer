import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "playwright/test";
import type { ConnectedAppsSettings } from "../../src/core/connectors/client";
import { FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID } from "../../src/core/connectors/settings";
import {
  launchExtensionContext,
  type ExtensionTestContext,
} from "./helpers/extension-context";
import {
  loadYtmFixtureThroughExtension,
  readFixtureEvents,
} from "./helpers/fixtures";

const execFile = promisify(execFileCallback);
const SCREENSHOT_PATH_ENV = "YTME_WINDOWS_TRAY_SCREENSHOT_PATH";
const SCREENSHOT_PLAYBACK_URL_ENV = "YTME_WINDOWS_TRAY_SCREENSHOT_PLAYBACK_URL";
const HOLD_RELEASE_PATH_ENV = "YTME_WINDOWS_TRAY_HOLD_RELEASE_PATH";
const HOLD_TIMEOUT_ENV = "YTME_WINDOWS_TRAY_HOLD_TIMEOUT_SECONDS";

interface TrayElementSnapshot {
  enabled: boolean;
  helpText: string;
  name: string;
  toggleState: string | null;
  value: string;
}

function windowsTraySmokeEnabled(): boolean {
  return process.env.YTME_E2E_WINDOWS_TRAY === "1";
}

function screenshotPlaybackUrl(): string | null {
  const value = process.env[SCREENSHOT_PLAYBACK_URL_ENV]?.trim();
  if (!value) return null;

  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "music.youtube.com") {
    throw new Error(
      `${SCREENSHOT_PLAYBACK_URL_ENV} must be an https://music.youtube.com URL.`,
    );
  }
  return url.toString();
}

function psLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runPowerShell(
  script: string,
  timeout = 120_000,
): Promise<string> {
  try {
    const { stdout } = await execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        cwd: process.cwd(),
        timeout,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    const commandError = error as Error & {
      stdout?: string;
      stderr?: string;
    };
    throw new Error(
      [commandError.stdout, commandError.stderr, commandError.message]
        .filter(Boolean)
        .join("\n"),
      { cause: error },
    );
  }
}

function trayInstallScript(
  installRoot: string,
  extensionId: string,
  projectName: string,
): string {
  const extensionOrigin = `chrome-extension://${extensionId}/`;
  const additionalOriginArgument =
    projectName === "firefox"
      ? ""
      : ` \`
  -AdditionalAllowedOrigins ${psLiteral(extensionOrigin)}
`;
  return `
$ErrorActionPreference = "Stop"
$RuntimeIdentifier = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "win-arm64" } else { "win-x64" }
Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force
& .\\apps\\windows-tray\\scripts\\install-native-hosts.ps1 \`
  -RuntimeIdentifier $RuntimeIdentifier \`
  -InstallRoot ${psLiteral(installRoot)}${additionalOriginArgument}
`;
}

function trayUninstallScript(installRoot: string): string {
  return `
$ErrorActionPreference = "Stop"
Get-Process YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
  Stop-Process -Force
& .\\apps\\windows-tray\\scripts\\uninstall-native-hosts.ps1 \`
  -InstallRoot ${psLiteral(installRoot)}
`;
}

function interactiveScript(
  name: string,
  resultPath: string,
  bodyLines: string[],
): string {
  const scriptContent = [
    '$ErrorActionPreference = "Stop"',
    `$ResultPath = ${psLiteral(resultPath)}`,
    "try {",
    ...bodyLines,
    "} catch {",
    "  $Payload = @{",
    "    ok = $false",
    "    error = $_.Exception.ToString()",
    "    scriptStack = $_.ScriptStackTrace",
    "  }",
    "}",
    "$Json = $Payload | ConvertTo-Json -Depth 8 -Compress",
    "[IO.File]::WriteAllText($ResultPath, $Json)",
  ].join("\n");
  const encodedScript = Buffer.from(scriptContent, "utf-8").toString("base64");

  return `
$ErrorActionPreference = "Stop"
$TaskName = "YTMEnhancerTrayButton-${name}-$PID"
$ScriptPath = Join-Path $env:TEMP "$TaskName.ps1"
$ResultPath = ${psLiteral(resultPath)}
$Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if (Test-Path -LiteralPath $ResultPath) {
  Remove-Item -LiteralPath $ResultPath -Force
}
$ScriptContent = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${encodedScript}"))
Set-Content -LiteralPath $ScriptPath -Value $ScriptContent -Encoding UTF8
try {
  function Invoke-ScheduledTaskCommand {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Arguments)

    $Output = & schtasks.exe @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "schtasks.exe $($Arguments -join ' ') failed with code $LASTEXITCODE\`n$Output"
    }
    return $Output
  }

  function Remove-ScheduledTaskIfPresent {
    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      & schtasks.exe /Delete /TN $TaskName /F 2>&1 | Out-Null
    } finally {
      $ErrorActionPreference = $PreviousErrorActionPreference
      $global:LASTEXITCODE = 0
    }
  }

  Remove-ScheduledTaskIfPresent
  $StartTime = (Get-Date).AddMinutes(5).ToString("HH:mm")
  $TaskAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \`"$ScriptPath\`""
  Invoke-ScheduledTaskCommand \`
    /Create \`
    /TN $TaskName \`
    /SC ONCE \`
    /ST $StartTime \`
    /TR $TaskAction \`
    /RL LIMITED \`
    /IT \`
    /F |
    Out-Null
  Invoke-ScheduledTaskCommand /Run /TN $TaskName | Out-Null

  $Deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $Deadline -and -not (Test-Path -LiteralPath $ResultPath)) {
    Start-Sleep -Milliseconds 250
  }
  if (-not (Test-Path -LiteralPath $ResultPath)) {
    $TaskInfo = & schtasks.exe /Query /TN $TaskName /V /FO LIST 2>&1
    throw "$TaskName did not create $ResultPath. Ensure $Identity is logged into an unlocked desktop session.\`n$TaskInfo"
  }
  $Payload = Get-Content -LiteralPath $ResultPath -Raw | ConvertFrom-Json
  if (-not $Payload.ok) {
    throw "$TaskName failed: $($Payload.error) $($Payload.scriptStack)"
  }
  $Payload | ConvertTo-Json -Depth 8 -Compress
} finally {
  Remove-ScheduledTaskIfPresent
  if (Test-Path -LiteralPath $ScriptPath) {
    Remove-Item -LiteralPath $ScriptPath -Force
  }
}
`;
}

async function launchTrayApp(
  executablePath: string,
  resultPath: string,
  logPath: string,
): Promise<number> {
  const output = await runPowerShell(
    interactiveScript("launch", resultPath, [
      `$ExecutablePath = ${psLiteral(executablePath)}`,
      `$env:YTM_TRAY_LOG_PATH = ${psLiteral(logPath)}`,
      '$env:YTM_TRAY_TEST_OPEN_POPUP = "1"',
      "$Process = Start-Process -FilePath $ExecutablePath -PassThru",
      "Start-Sleep -Milliseconds 1500",
      "$StartedProcess = Get-Process -Id $Process.Id -ErrorAction Stop",
      "$Payload = @{",
      "  ok = $true",
      "  pid = $StartedProcess.Id",
      "  sessionId = $StartedProcess.SessionId",
      "}",
    ]),
    60_000,
  );
  const result = JSON.parse(output) as { pid: number };
  return result.pid;
}

const TRAY_UIA_HELPERS = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$NativeInputSource = @'
using System;
using System.Runtime.InteropServices;
public static class NativeInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct Point {
    public int X;
    public int Y;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool GetClientRect(IntPtr hWnd, out Rect rect);
  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref Point point);
}
'@
Add-Type -TypeDefinition $NativeInputSource

function Get-ClientScreenRectangle {
  param([Parameter(Mandatory = $true)][IntPtr] $Handle)

  $ClientRect = [NativeInput+Rect]::new()
  if (-not [NativeInput]::GetClientRect($Handle, [ref]$ClientRect)) {
    throw "Unable to read the About dialog client rectangle."
  }
  $TopLeft = [NativeInput+Point]::new()
  $TopLeft.X = $ClientRect.Left
  $TopLeft.Y = $ClientRect.Top
  $BottomRight = [NativeInput+Point]::new()
  $BottomRight.X = $ClientRect.Right
  $BottomRight.Y = $ClientRect.Bottom
  if (-not [NativeInput]::ClientToScreen($Handle, [ref]$TopLeft) -or
      -not [NativeInput]::ClientToScreen($Handle, [ref]$BottomRight)) {
    throw "Unable to map the About dialog client rectangle to screen coordinates."
  }
  return [System.Drawing.Rectangle]::FromLTRB(
    $TopLeft.X,
    $TopLeft.Y,
    $BottomRight.X,
    $BottomRight.Y
  )
}

function Get-Elements {
  $Root = [System.Windows.Automation.AutomationElement]::RootElement
  return $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
}

function Find-ElementByName {
  param(
    [Parameter(Mandatory = $true)] $Root,
    [Parameter(Mandatory = $true)][string] $Name
  )
  $Condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    $Name
  )
  return $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $Condition)
}

function Wait-ElementByName {
  param(
    [Parameter(Mandatory = $true)] $Root,
    [Parameter(Mandatory = $true)][string] $Name,
    [int] $TimeoutMilliseconds = 8000
  )
  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)
  do {
    $Element = Find-ElementByName $Root $Name
    if ($null -ne $Element) { return $Element }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $Deadline)
  return $null
}

function Find-RootButtonByName {
  param([Parameter(Mandatory = $true)][string] $Name)
  foreach ($Element in Get-Elements) {
    if ($Element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
        $Element.Current.Name -like "*$Name*") {
      return $Element
    }
  }
  return $null
}

function Find-RootWindowByName {
  param([Parameter(Mandatory = $true)][string] $Name)
  $Root = [System.Windows.Automation.AutomationElement]::RootElement
  $WindowCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window
  )
  foreach ($Window in $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $WindowCondition)) {
    if ($Window.Current.Name -like "*$Name*") { return $Window }
  }
  return $null
}

function Wait-RootButtonByName {
  param(
    [Parameter(Mandatory = $true)][string] $Name,
    [int] $TimeoutMilliseconds = 8000
  )
  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)
  do {
    $Button = Find-RootButtonByName $Name
    if ($null -ne $Button) { return $Button }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $Deadline)
  return $null
}

function Find-WindowByName {
  param([Parameter(Mandatory = $true)][string] $Name)
  return Find-RootWindowByName $Name
}

function Wait-WindowByName {
  param(
    [Parameter(Mandatory = $true)][string] $Name,
    [int] $TimeoutMilliseconds = 8000
  )
  $Deadline = (Get-Date).AddMilliseconds($TimeoutMilliseconds)
  do {
    $Window = Find-WindowByName $Name
    if ($null -ne $Window) { return $Window }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $Deadline)
  return $null
}

function Test-VisibleWindow {
  param([Parameter(Mandatory = $true)] $Window)
  $Rect = $Window.Current.BoundingRectangle
  return -not $Window.Current.IsOffscreen -and $Rect.Width -gt 0 -and $Rect.Height -gt 0
}

function Get-VisibleElementNames {
  $Names = New-Object System.Collections.Generic.List[string]
  foreach ($Element in Get-Elements) {
    if ($Element.Current.Name) { $Names.Add($Element.Current.Name) }
  }
  return $Names
}

function Get-VisibleWindowNames {
  $Names = New-Object System.Collections.Generic.List[string]
  $Root = [System.Windows.Automation.AutomationElement]::RootElement
  $WindowCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window
  )
  foreach ($Window in $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $WindowCondition)) {
    if ($Window.Current.Name) { $Names.Add($Window.Current.Name) }
  }
  return $Names
}

function Invoke-ElementDefaultAction {
  param([Parameter(Mandatory = $true)] $Element)

  $InvokePattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$InvokePattern)) {
    try {
      $InvokePattern.Invoke()
      return $true
    } catch {
      # Fall through to pointer activation.
    }
  }

  return $false
}

function Send-ElementWindowClick {
  param(
    [Parameter(Mandatory = $true)] $Element,
    [double] $XFraction = 0.5,
    [double] $YFraction = 0.5
  )

  $Handle = $Element.Current.NativeWindowHandle
  if ($Handle -eq 0) { return $false }

  $Rect = $Element.Current.BoundingRectangle
  if ($Rect.Width -le 0 -or $Rect.Height -le 0) { return $false }

  $ClientX = [Math]::Max(0, [int]($Rect.Width * $XFraction))
  $ClientY = [Math]::Max(0, [int]($Rect.Height * $YFraction))
  $LParamValue = (($ClientY -band 0xffff) -shl 16) -bor ($ClientX -band 0xffff)
  $LParam = [IntPtr]$LParamValue
  [NativeInput]::SendMessage([IntPtr]$Handle, 0x0201, [IntPtr]1, $LParam) | Out-Null
  [NativeInput]::SendMessage([IntPtr]$Handle, 0x0202, [IntPtr]0, $LParam) | Out-Null
  return $true
}

function Click-Element {
  param(
    [Parameter(Mandatory = $true)] $Element,
    [double] $XFraction = 0.5,
    [double] $YFraction = 0.5
  )
  if ([Math]::Abs($XFraction - 0.5) -lt 0.001 -and [Math]::Abs($YFraction - 0.5) -lt 0.001) {
    if (Invoke-ElementDefaultAction $Element) {
      Start-Sleep -Milliseconds 150
      return
    }
  }

  if (Send-ElementWindowClick $Element $XFraction $YFraction) {
    Start-Sleep -Milliseconds 150
    return
  }

  $Rect = $Element.Current.BoundingRectangle
  if ($Rect.Width -le 0 -or $Rect.Height -le 0) {
    throw "Element is not clickable: $($Element.Current.Name)"
  }
  $X = [int]($Rect.X + ($Rect.Width * $XFraction))
  $Y = [int]($Rect.Y + ($Rect.Height * $YFraction))
  [NativeInput]::SetCursorPos($X, $Y) | Out-Null
  Start-Sleep -Milliseconds 100
  [NativeInput]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [NativeInput]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}

function Activate-Window {
  param([Parameter(Mandatory = $true)] $Window)
  $Handle = $Window.Current.NativeWindowHandle
  if ($Handle -eq 0) { return }
  [NativeInput]::SetForegroundWindow([IntPtr]$Handle) | Out-Null
  Start-Sleep -Milliseconds 150
}

function Open-TrayPopup {
  $PopupWindow = Find-WindowByName "YTM Tray"
  if ($null -ne $PopupWindow -and (Test-VisibleWindow $PopupWindow)) {
    Activate-Window $PopupWindow
    return $PopupWindow
  }

  $TrayButton = Wait-RootButtonByName "YTM Enhancer" 5000
  if ($null -eq $TrayButton) {
    $HiddenIconsButton = Find-RootButtonByName "Show Hidden Icons"
    if ($null -ne $HiddenIconsButton) {
      Click-Element $HiddenIconsButton
      Start-Sleep -Milliseconds 900
      $TrayButton = Wait-RootButtonByName "YTM Enhancer" 8000
    }
  }
  if ($null -eq $TrayButton) {
    throw "YTM Enhancer tray icon was not found. Visible elements: $((Get-VisibleElementNames) -join ', ')"
  }

  Click-Element $TrayButton
  $PopupWindow = Wait-WindowByName "YTM Tray" 8000
  if ($null -eq $PopupWindow) {
    throw "YTM Tray popup window was not found after clicking tray icon."
  }
  Activate-Window $PopupWindow
  return $PopupWindow
}

function Save-RectangleScreenshot {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)] $Rect,
    [int] $Padding = 0
  )
  $ScreenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $Left = [Math]::Max($ScreenBounds.Left, [int][Math]::Floor($Rect.X) - $Padding)
  $Top = [Math]::Max($ScreenBounds.Top, [int][Math]::Floor($Rect.Y) - $Padding)
  $Right = [Math]::Min($ScreenBounds.Right, [int][Math]::Ceiling($Rect.Right) + $Padding)
  $Bottom = [Math]::Min($ScreenBounds.Bottom, [int][Math]::Ceiling($Rect.Bottom) + $Padding)
  $Width = $Right - $Left
  $Height = $Bottom - $Top
  if ($Width -le 0 -or $Height -le 0) {
    throw "Invalid screenshot rectangle: $Rect"
  }
  $OutputDirectory = Split-Path -Parent $Path
  if ($OutputDirectory) {
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
  }
  $Bitmap = New-Object System.Drawing.Bitmap $Width, $Height
  $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
  try {
    $Graphics.CopyFromScreen($Left, $Top, 0, 0, $Bitmap.Size)
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $Graphics.Dispose()
    $Bitmap.Dispose()
  }
}

function Move-CursorAwayFromRectangle {
  param([Parameter(Mandatory = $true)] $Rect)
  $ScreenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $X = [int]($ScreenBounds.Right - 16)
  $Y = [int]($ScreenBounds.Top + 16)
  if ($Rect.Contains($X, $Y)) {
    $X = [int]($ScreenBounds.Left + 16)
    $Y = [int]($ScreenBounds.Bottom - 16)
  }
  [NativeInput]::SetCursorPos($X, $Y) | Out-Null
  Start-Sleep -Milliseconds 700
}

function Save-TrayPopupScreenshot {
  param([Parameter(Mandatory = $true)][string] $Path)
  $PopupWindow = Open-TrayPopup
  Activate-Window $PopupWindow
  Move-CursorAwayFromRectangle $PopupWindow.Current.BoundingRectangle
  Save-RectangleScreenshot -Path $Path -Rect $PopupWindow.Current.BoundingRectangle -Padding 0
}

function Click-PopupElementByName {
  param(
    [Parameter(Mandatory = $true)][string] $Name,
    [double] $XFraction = 0.5
  )
  $PopupWindow = Open-TrayPopup
  Activate-Window $PopupWindow
  $Element = Wait-ElementByName $PopupWindow $Name
  if ($null -eq $Element) {
    throw "Popup element '$Name' was not found. Visible elements: $((Get-VisibleElementNames) -join ', ')"
  }
  Click-Element $Element $XFraction 0.5
}
`;

async function runTrayUiAction(
  name: string,
  resultPath: string,
  bodyLines: string[],
): Promise<void> {
  await runPowerShell(
    interactiveScript(name, resultPath, [
      TRAY_UIA_HELPERS,
      ...bodyLines,
      "$Payload = @{ ok = $true }",
    ]),
    60_000,
  );
}

async function readTrayPopupElement(
  name: string,
  resultPath: string,
  elementName: string,
): Promise<TrayElementSnapshot> {
  const output = await runPowerShell(
    interactiveScript(name, resultPath, [
      TRAY_UIA_HELPERS,
      "$PopupWindow = Open-TrayPopup",
      "Activate-Window $PopupWindow",
      `$Element = Wait-ElementByName $PopupWindow ${psLiteral(elementName)}`,
      'if ($null -eq $Element) { throw "Popup element was not found. Visible elements: $((Get-VisibleElementNames) -join ", ")" }',
      "$TogglePattern = $null",
      "$ToggleState = $null",
      "if ($Element.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$TogglePattern)) {",
      "  $ToggleState = $TogglePattern.Current.ToggleState.ToString()",
      "}",
      "$ValuePattern = $null",
      '$Value = ""',
      "if ($Element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$ValuePattern)) {",
      "  $Value = $ValuePattern.Current.Value",
      "}",
      "$Payload = @{",
      "  ok = $true",
      "  enabled = $Element.Current.IsEnabled",
      "  helpText = $Element.Current.HelpText",
      "  name = $Element.Current.Name",
      "  toggleState = $ToggleState",
      "  value = $Value",
      "}",
    ]),
    60_000,
  );
  return JSON.parse(output.trim()) as TrayElementSnapshot;
}

function trayProgressPercent(snapshot: TrayElementSnapshot): number {
  const percent = Number(snapshot.value.trim());
  if (!Number.isFinite(percent)) {
    throw new Error(
      `Playback progress ValuePattern returned a non-numeric value: ${snapshot.value}`,
    );
  }
  return percent;
}

async function holdTrayConnectionIfRequested(): Promise<void> {
  const releasePath = process.env[HOLD_RELEASE_PATH_ENV]?.trim();
  if (!releasePath) return;

  const configuredTimeout = Number(process.env[HOLD_TIMEOUT_ENV] ?? "240");
  const timeout = Number.isFinite(configuredTimeout)
    ? Math.max(30, configuredTimeout) * 1000
    : 240_000;
  await expect
    .poll(
      () =>
        runPowerShell(
          `if (Test-Path -LiteralPath ${psLiteral(releasePath)}) { "released" }`,
          15_000,
        ),
      { timeout },
    )
    .toContain("released");
}

async function clickTrayPopupElement(
  name: string,
  resultPath: string,
  elementName: string,
  xFraction = 0.5,
): Promise<void> {
  await runTrayUiAction(name, resultPath, [
    `Click-PopupElementByName ${psLiteral(elementName)} ${xFraction}`,
    "Start-Sleep -Milliseconds 350",
  ]);
}

async function captureTrayPromoScreenshot(
  resultPath: string,
  screenshotPath: string,
): Promise<void> {
  await runTrayUiAction("screenshot", resultPath, [
    `Save-TrayPopupScreenshot ${psLiteral(screenshotPath)}`,
    "Start-Sleep -Milliseconds 350",
  ]);
}

async function loadLivePlaybackForScreenshot(
  page: Page,
  playbackUrl: string,
): Promise<void> {
  await page.goto(playbackUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.bringToFront();
  await page
    .waitForLoadState("networkidle", { timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(5000);
}

async function captureLiveTrayPromoScreenshot(
  extension: ExtensionTestContext,
  resultPath: string,
  screenshotPath: string,
  trayLogPath: string,
): Promise<void> {
  const playbackUrl = screenshotPlaybackUrl();
  if (!playbackUrl) {
    throw new Error(
      `Set ${SCREENSHOT_PLAYBACK_URL_ENV} to the approved Creative Commons ` +
        `YouTube Music track before setting ${SCREENSHOT_PATH_ENV}.`,
    );
  }

  const playbackPage = await extension.context.newPage();
  try {
    await loadLivePlaybackForScreenshot(playbackPage, playbackUrl);
    await expectTrayLogContains(trayLogPath, "current artwork displayed url=");
    await captureTrayPromoScreenshot(resultPath, screenshotPath);
  } finally {
    await playbackPage.close().catch(() => undefined);
  }
}

async function clickAboutAndClose(
  resultPath: string,
  expectedConnectionSummary: string,
): Promise<void> {
  await runTrayUiAction("about", resultPath, [
    'Click-PopupElementByName "About YTM Tray"',
    '$Dialog = Wait-WindowByName "About YTM Tray" 8000',
    "if ($null -eq $Dialog) { throw \"About dialog was not shown. Visible windows: $((Get-VisibleWindowNames) -join ', ')\" }",
    `$ExpectedAboutText = @("Beta", "Updates", ${psLiteral(expectedConnectionSummary)})`,
    "foreach ($Name in $ExpectedAboutText) {",
    "  if ($null -eq (Find-ElementByName $Dialog $Name)) {",
    "    throw \"About dialog text '$Name' was not found. Visible elements: $((Get-VisibleElementNames) -join ', ')\"",
    "  }",
    "}",
    'if ($null -ne (Find-ElementByName $Dialog "How updates work")) { throw "About dialog still exposes internal update details." }',
    '$UpdateAction = Find-ElementByName $Dialog "Check for Updates"',
    'if ($null -eq $UpdateAction) { $UpdateAction = Find-ElementByName $Dialog "Check Again" }',
    "if ($null -eq $UpdateAction) {",
    "  $Descendants = $Dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)",
    "  foreach ($Element in $Descendants) {",
    '    if ($Element.Current.Name -like "Install Update*") {',
    "      $UpdateAction = $Element",
    "      break",
    "    }",
    "  }",
    "}",
    'if ($null -eq $UpdateAction) { throw "About dialog update action was not found." }',
    '$CloseButton = Find-ElementByName $Dialog "Close"',
    'if ($null -eq $CloseButton) { throw "About dialog Close button was not found." }',
    "$DialogRect = $Dialog.Current.BoundingRectangle",
    "$DialogHandle = [IntPtr]$Dialog.Current.NativeWindowHandle",
    "$ClientRect = Get-ClientScreenRectangle $DialogHandle",
    "$WorkingArea = [System.Windows.Forms.Screen]::FromHandle($DialogHandle).WorkingArea",
    "if (",
    "  $DialogRect.Left -lt $WorkingArea.Left -or",
    "  $DialogRect.Top -lt $WorkingArea.Top -or",
    "  $DialogRect.Right -gt $WorkingArea.Right -or",
    "  $DialogRect.Bottom -gt $WorkingArea.Bottom",
    ") {",
    '  throw "About dialog extends beyond its monitor working area."',
    "}",
    "foreach ($Action in @($UpdateAction, $CloseButton)) {",
    "  $ActionRect = $Action.Current.BoundingRectangle",
    "  if (",
    "    $Action.Current.IsOffscreen -or",
    "    $ActionRect.Width -le 0 -or",
    "    $ActionRect.Height -le 0 -or",
    "    $ActionRect.Left -lt $ClientRect.Left -or",
    "    $ActionRect.Top -lt $ClientRect.Top -or",
    "    $ActionRect.Right -gt $ClientRect.Right -or",
    "    $ActionRect.Bottom -gt $ClientRect.Bottom",
    "  ) {",
    `    throw "About dialog action '$($Action.Current.Name)' is clipped or offscreen."`,
    "  }",
    "}",
    "Click-Element $CloseButton",
    "Start-Sleep -Milliseconds 350",
  ]);
}

async function expectFixtureEvent(
  page: Page,
  eventName: string,
): Promise<void> {
  await expect.poll(() => readFixtureEvents(page)).toContain(eventName);
}

async function expectFixtureEventPrefix(
  page: Page,
  eventPrefix: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const events = await readFixtureEvents(page);
      return events.some((event) => event.startsWith(eventPrefix));
    })
    .toBe(true);
}

async function expectTrayLogContains(
  logPath: string,
  text: string,
): Promise<void> {
  await expect
    .poll(() =>
      runPowerShell(
        `if (Test-Path -LiteralPath ${psLiteral(
          logPath,
        )}) { Get-Content -LiteralPath ${psLiteral(logPath)} -Raw }`,
        15_000,
      ),
    )
    .toContain(text);
}

async function readConnectedAppsSettings(
  extension: ExtensionTestContext,
): Promise<ConnectedAppsSettings> {
  const response = extension.firefox
    ? await extension.firefox.sendRuntimeMessage<
        { ok: true; data: ConnectedAppsSettings } | { ok: false; error: string }
      >({
        type: "get-connected-apps-settings",
      })
    : await extension.popup.evaluate(
        () =>
          chrome.runtime.sendMessage({
            type: "get-connected-apps-settings",
          }) as Promise<
            | { ok: true; data: ConnectedAppsSettings }
            | { ok: false; error: string }
          >,
      );

  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

async function enableConnectedApps(
  extension: ExtensionTestContext,
): Promise<void> {
  if (extension.firefox) {
    const response = await extension.firefox.sendRuntimeMessage<
      { ok: true } | { ok: false; error: string }
    >({
      type: "set-connected-apps-enabled",
      enabled: true,
    });
    if (!response.ok) throw new Error(response.error);
    return;
  }

  await extension.popup
    .locator(".nav-item", { hasText: "Connected Apps" })
    .click();
  await extension.popup.getByLabel("Enable Connected Apps").check();
}

async function setWindowsTrayLifecycleEnabled(
  extension: ExtensionTestContext,
  enabled: boolean,
): Promise<void> {
  if (extension.firefox) {
    throw new Error(
      "The Windows tray lifecycle UI smoke currently requires Chromium popup control.",
    );
  }

  await extension.popup
    .locator(".nav-item", { hasText: "Connected Apps" })
    .click();
  const card = extension.popup.locator(
    `[data-app-id="${FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID}"]`,
  );
  if (
    !(await card.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await card.locator("summary").click();
  }

  const lifecycleButton = card.locator(
    '[data-role="connected-app-lifecycle-button"]',
  );
  await expect(lifecycleButton).toHaveText(
    enabled ? "Enable App" : "Disable App",
  );
  await lifecycleButton.click();
  await expect
    .poll(async () => {
      const settings = await readConnectedAppsSettings(extension);
      return settings.connectors.find(
        (connector) => connector.id === FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID,
      )?.enabled;
    })
    .toBe(enabled);
}

async function publishPartialPlaybackMetadata(page: Page): Promise<void> {
  await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>(
      "yt-formatted-string.title.style-scope.ytmusic-player-bar",
    );
    const progress = document.querySelector<HTMLInputElement>("#progress-bar");
    const timeInfo = document.querySelector<HTMLElement>("#time-info");
    const video = document.querySelector<HTMLVideoElement>(
      "video.html5-main-video",
    );
    if (!title || !progress || !timeInfo || !video) {
      throw new Error("Playback fixture is missing partial-metadata controls.");
    }

    title.textContent = "";
    progress.value = "91";
    timeInfo.textContent = "1:31 / 4:56";
    video.dispatchEvent(new Event("timeupdate"));
  });
}

async function expectWindowsTrayConnected(
  extension: ExtensionTestContext,
): Promise<void> {
  if (extension.firefox) {
    await expect
      .poll(
        async () => {
          const settings = await readConnectedAppsSettings(extension);
          return settings.connectors.find(
            (connector) =>
              connector.id === FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID,
          )?.status;
        },
        { timeout: 20_000 },
      )
      .toBe("connected");
    return;
  }

  await expect(
    extension.popup.locator(
      `[data-app-id="${FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID}"] [data-role="connected-app-status"]`,
    ),
  ).toHaveText("Connected", { timeout: 20_000 });
}

// Playwright requires the first callback parameter to be a destructured fixture object.
// eslint-disable-next-line no-empty-pattern
test("routes Windows tray buttons through the browser native messaging host", async ({}, testInfo) => {
  test.setTimeout(420_000);
  test.skip(
    !windowsTraySmokeEnabled(),
    "Set YTME_E2E_WINDOWS_TRAY=1 to run the Windows tray connector smoke.",
  );
  test.skip(
    process.platform !== "win32",
    "The Windows tray connector smoke installs Windows native messaging hosts.",
  );
  test.skip(
    testInfo.project.name !== "edge" && testInfo.project.name !== "firefox",
    "The Windows tray connector smoke is scoped to Microsoft Edge and Firefox.",
  );

  const installRoot = testInfo.outputPath("tray-install");
  const executablePath = `${installRoot}\\YTMTray.exe`;
  const trayLogPath = testInfo.outputPath("tray.log");
  const promoScreenshotPath = process.env[SCREENSHOT_PATH_ENV];
  let extension: Awaited<ReturnType<typeof launchExtensionContext>> | undefined;

  try {
    extension = await launchExtensionContext(testInfo);
    await runPowerShell(
      trayInstallScript(
        installRoot,
        extension.extensionId,
        testInfo.project.name,
      ),
      300_000,
    );
    const trayProcessId = await launchTrayApp(
      executablePath,
      testInfo.outputPath("tray-launch.json"),
      trayLogPath,
    );

    const ytmPage = await extension.context.newPage();
    await loadYtmFixtureThroughExtension(ytmPage, "player-loaded-paused");

    await enableConnectedApps(extension);
    await expectWindowsTrayConnected(extension);
    await ytmPage.bringToFront();
    await ytmPage.waitForTimeout(2500);
    await holdTrayConnectionIfRequested();

    const initialRepeat = await readTrayPopupElement(
      "repeat-off-state",
      testInfo.outputPath("tray-repeat-off-state.json"),
      "Repeat off",
    );
    expect(initialRepeat).toMatchObject({
      enabled: true,
      name: "Repeat off",
      toggleState: "Off",
      value: "off",
    });
    const initialProgress = await readTrayPopupElement(
      "progress-state",
      testInfo.outputPath("tray-progress-state.json"),
      "Playback progress",
    );
    expect(initialProgress).toMatchObject({
      enabled: true,
      name: "Playback progress",
    });
    expect(trayProgressPercent(initialProgress)).toBeGreaterThan(25);
    expect(trayProgressPercent(initialProgress)).toBeLessThan(32);

    await clickTrayPopupElement(
      "play",
      testInfo.outputPath("tray-play.json"),
      "Play",
    );
    await expectFixtureEvent(ytmPage, "player-play-clicked");
    await expectFixtureEvent(ytmPage, "player-play-pause-clicked");
    await clickTrayPopupElement(
      "next",
      testInfo.outputPath("tray-next.json"),
      "Next",
    );
    await expectFixtureEvent(ytmPage, "next-clicked");

    await clickTrayPopupElement(
      "previous",
      testInfo.outputPath("tray-previous.json"),
      "Previous",
    );
    await expectFixtureEvent(ytmPage, "previous-clicked");

    await clickTrayPopupElement(
      "shuffle",
      testInfo.outputPath("tray-shuffle.json"),
      "Shuffle",
    );
    await expectFixtureEvent(ytmPage, "shuffle-clicked");

    await clickTrayPopupElement(
      "repeat",
      testInfo.outputPath("tray-repeat.json"),
      "Repeat off",
    );
    await expectFixtureEvent(ytmPage, "repeat-clicked");
    await expect
      .poll(
        () =>
          readTrayPopupElement(
            "repeat-all-state",
            testInfo.outputPath("tray-repeat-all-state.json"),
            "Repeat all",
          ),
        { timeout: 15_000 },
      )
      .toMatchObject({
        enabled: true,
        name: "Repeat all",
        toggleState: "On",
        value: "all",
      });

    await clickTrayPopupElement(
      "seek",
      testInfo.outputPath("tray-seek.json"),
      "Playback progress",
      0.72,
    );
    await expectFixtureEventPrefix(ytmPage, "seek-change:");
    const soughtProgress = await readTrayPopupElement(
      "progress-after-seek",
      testInfo.outputPath("tray-progress-after-seek.json"),
      "Playback progress",
    );
    expect(trayProgressPercent(soughtProgress)).toBeGreaterThan(68);
    expect(trayProgressPercent(soughtProgress)).toBeLessThan(76);

    await clickTrayPopupElement(
      "focus",
      testInfo.outputPath("tray-focus.json"),
      "Focus YouTube Music",
    );
    await expectTrayLogContains(trayLogPath, "requestId=focus-");

    const browserSource =
      testInfo.project.name === "firefox"
        ? "Connected to Firefox (dev)."
        : "Connected to Microsoft Edge (dev).";
    await clickAboutAndClose(
      testInfo.outputPath("tray-about.json"),
      browserSource,
    );
    await expect
      .poll(async () =>
        (
          await runPowerShell(
            `$Process = Get-Process -Id ${trayProcessId} -ErrorAction SilentlyContinue; if ($null -ne $Process) { $Process.Id }`,
            15_000,
          )
        ).trim(),
      )
      .toBe(String(trayProcessId));
    if (promoScreenshotPath && testInfo.project.name === "edge") {
      await captureLiveTrayPromoScreenshot(
        extension,
        testInfo.outputPath("tray-screenshot.json"),
        promoScreenshotPath,
        trayLogPath,
      );
    }

    await publishPartialPlaybackMetadata(ytmPage);
    await expect
      .poll(
        () =>
          readTrayPopupElement(
            "partial-metadata",
            testInfo.outputPath("tray-partial-metadata.json"),
            "Unknown track",
          ),
        { timeout: 15_000 },
      )
      .toMatchObject({ enabled: true, name: "Unknown track" });
    const partialMetadataToggle = await readTrayPopupElement(
      "partial-metadata-toggle",
      testInfo.outputPath("tray-partial-metadata-toggle.json"),
      "Pause",
    );
    expect(partialMetadataToggle.enabled).toBe(true);

    if (testInfo.project.name === "edge") {
      await setWindowsTrayLifecycleEnabled(extension, false);
      await expect
        .poll(
          () =>
            readTrayPopupElement(
              "disabled-status",
              testInfo.outputPath("tray-disabled-status.json"),
              "Disconnected",
            ),
          { timeout: 20_000 },
        )
        .toMatchObject({ name: "Disconnected" });
      const disabledProgress = await readTrayPopupElement(
        "disabled-progress",
        testInfo.outputPath("tray-disabled-progress.json"),
        "Playback progress",
      );
      expect(disabledProgress.enabled).toBe(false);
      await clickAboutAndClose(
        testInfo.outputPath("tray-about-disabled.json"),
        "Not connected to a browser.",
      );

      await setWindowsTrayLifecycleEnabled(extension, true);
      await expectWindowsTrayConnected(extension);
      await expect
        .poll(
          () =>
            readTrayPopupElement(
              "reenabled-playback",
              testInfo.outputPath("tray-reenabled-playback.json"),
              "Unknown track",
            ),
          { timeout: 20_000 },
        )
        .toMatchObject({ enabled: true, name: "Unknown track" });
    }

    await ytmPage.close();
    await expect
      .poll(
        () =>
          readTrayPopupElement(
            "missing-tab-status",
            testInfo.outputPath("tray-missing-tab-status.json"),
            "No YouTube Music tab",
          ),
        { timeout: 25_000 },
      )
      .toMatchObject({ name: "No YouTube Music tab" });

    await expect
      .poll(
        () =>
          readTrayPopupElement(
            "missing-tab-action",
            testInfo.outputPath("tray-missing-tab-action.json"),
            "Open YouTube Music",
          ),
        { timeout: 15_000 },
      )
      .toMatchObject({ enabled: true, name: "Open YouTube Music" });
    await clickTrayPopupElement(
      "open",
      testInfo.outputPath("tray-open.json"),
      "Open YouTube Music",
    );
    await expect
      .poll(
        () =>
          extension!.context
            .pages()
            .filter((page) =>
              page.url().startsWith("https://music.youtube.com/"),
            ).length,
        { timeout: 15_000 },
      )
      .toBe(1);
    await expect
      .poll(
        () =>
          readTrayPopupElement(
            "opened-tab-action",
            testInfo.outputPath("tray-opened-tab-action.json"),
            "Focus YouTube Music",
          ),
        { timeout: 15_000 },
      )
      .toMatchObject({ enabled: true, name: "Focus YouTube Music" });

    await clickTrayPopupElement(
      "quit",
      testInfo.outputPath("tray-quit.json"),
      "Quit",
    );
    await expect
      .poll(
        () =>
          runPowerShell(
            "$Process = [System.Diagnostics.Process]::GetProcessesByName('YTMTray') | Select-Object -First 1; if ($null -ne $Process) { $Process.Id }",
            15_000,
          ),
        { timeout: 15_000 },
      )
      .toBe("");
  } finally {
    await extension?.context.close().catch(() => undefined);
    await runPowerShell(trayUninstallScript(installRoot), 120_000).catch(
      () => undefined,
    );
  }
});

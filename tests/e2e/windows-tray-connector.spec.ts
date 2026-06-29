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

function windowsTraySmokeEnabled(): boolean {
  return process.env.YTME_E2E_WINDOWS_TRAY === "1";
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
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  $Action = New-ScheduledTaskAction \`
    -Execute "powershell.exe" \`
    -Argument "-NoProfile -ExecutionPolicy Bypass -File \`"$ScriptPath\`""
  $Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
  $Principal = New-ScheduledTaskPrincipal \`
    -UserId $Identity \`
    -LogonType Interactive \`
    -RunLevel Limited
  $Settings = New-ScheduledTaskSettingsSet \`
    -AllowStartIfOnBatteries \`
    -DontStopIfGoingOnBatteries \`
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
  Register-ScheduledTask \`
    -TaskName $TaskName \`
    -Action $Action \`
    -Trigger $Trigger \`
    -Principal $Principal \`
    -Settings $Settings \`
    -Force |
    Out-Null
  Start-ScheduledTask -TaskName $TaskName
  $Deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $Deadline -and -not (Test-Path -LiteralPath $ResultPath)) {
    Start-Sleep -Milliseconds 250
  }
  if (-not (Test-Path -LiteralPath $ResultPath)) {
    $TaskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    throw "$TaskName did not create $ResultPath. LastTaskResult=$($TaskInfo.LastTaskResult)"
  }
  $Payload = Get-Content -LiteralPath $ResultPath -Raw | ConvertFrom-Json
  if (-not $Payload.ok) {
    throw "$TaskName failed: $($Payload.error) $($Payload.scriptStack)"
  }
  $Payload | ConvertTo-Json -Depth 8 -Compress
} finally {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
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
): Promise<void> {
  await runPowerShell(
    interactiveScript("launch", resultPath, [
      `$ExecutablePath = ${psLiteral(executablePath)}`,
      `$env:YTM_TRAY_LOG_PATH = ${psLiteral(logPath)}`,
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
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
Add-Type -TypeDefinition $NativeInputSource

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

function Click-Element {
  param(
    [Parameter(Mandatory = $true)] $Element,
    [double] $XFraction = 0.5,
    [double] $YFraction = 0.5
  )
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

function Save-TrayPopupScreenshot {
  param([Parameter(Mandatory = $true)][string] $Path)
  $PopupWindow = Open-TrayPopup
  Activate-Window $PopupWindow
  Save-RectangleScreenshot -Path $Path -Rect $PopupWindow.Current.BoundingRectangle -Padding 2
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

async function clickAboutAndClose(resultPath: string): Promise<void> {
  await runTrayUiAction("about", resultPath, [
    'Click-PopupElementByName "About YTM Tray"',
    '$Dialog = Wait-WindowByName "About YTM Tray" 8000',
    "if ($null -eq $Dialog) { throw \"About dialog was not shown. Visible windows: $((Get-VisibleWindowNames) -join ', ')\" }",
    '$OkButton = Find-ElementByName $Dialog "OK"',
    'if ($null -eq $OkButton) { throw "About dialog OK button was not found." }',
    "Click-Element $OkButton",
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
  const promoScreenshotPath = process.env.YTME_WINDOWS_TRAY_SCREENSHOT_PATH;
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
    await launchTrayApp(
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

    await clickTrayPopupElement(
      "play",
      testInfo.outputPath("tray-play.json"),
      "Play",
    );
    await expectFixtureEvent(ytmPage, "player-play-clicked");
    await expectFixtureEvent(ytmPage, "player-play-pause-clicked");
    if (promoScreenshotPath && testInfo.project.name === "edge") {
      await ytmPage.waitForTimeout(1500);
      await captureTrayPromoScreenshot(
        testInfo.outputPath("tray-screenshot.json"),
        promoScreenshotPath,
      );
    }

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
      "Repeat",
    );
    await expectFixtureEvent(ytmPage, "repeat-clicked");

    await clickTrayPopupElement(
      "seek",
      testInfo.outputPath("tray-seek.json"),
      "Playback progress",
      0.72,
    );
    await expectFixtureEventPrefix(ytmPage, "seek-change:");

    await clickTrayPopupElement(
      "focus",
      testInfo.outputPath("tray-focus.json"),
      "Focus YouTube Music",
    );
    await expectTrayLogContains(trayLogPath, "requestId=focus-");

    await clickAboutAndClose(testInfo.outputPath("tray-about.json"));
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

import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "playwright/test";
import { FIRST_PARTY_MENU_BAR_CONNECTOR_ID } from "../../src/core/connectors/settings";
import type { ConnectedAppsSettings } from "../../src/core/connectors/client";
import {
  extensionUserDataDir,
  launchExtensionContext,
  type ExtensionTestContext,
} from "./helpers/extension-context";
import {
  loadYtmFixtureThroughExtension,
  readFixtureEvents,
} from "./helpers/fixtures";

const execFile = promisify(execFileCallback);

function menuBarSmokeEnabled(): boolean {
  return process.env.YTME_E2E_MENU_BAR === "1";
}

function menuBarAutomationRequired(): boolean {
  return process.env.YTME_E2E_REQUIRE_MENU_BAR_AUTOMATION === "1";
}

function shLiteral(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function appleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function runShell(
  script: string,
  timeout = 120_000,
  env: NodeJS.ProcessEnv = {},
): Promise<string> {
  try {
    const { stdout } = await execFile("/bin/bash", ["-lc", script], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      timeout,
    });
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

async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFile("osascript", ["-e", script], {
      cwd: process.cwd(),
      timeout: 60_000,
    });
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

async function runSwift(script: string): Promise<string> {
  try {
    const { stdout } = await execFile("/usr/bin/swift", ["-e", script], {
      cwd: process.cwd(),
      timeout: 60_000,
    });
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

const MENU_BAR_APPLESCRIPT_HELPERS = String.raw`
on findMenuBarProcessName()
  tell application "System Events"
    repeat with processName in {"YTM Menu Bar", "YTMMenuBarConnector"}
      if exists application process (processName as text) then
        return processName as text
      end if
    end repeat
  end tell
  error "YTM Menu Bar process was not found"
end findMenuBarProcessName

on appendTextPart(textParts, possibleText)
  if possibleText is not missing value then
    set normalizedText to possibleText as text
    if normalizedText is not "" then
      set end of textParts to normalizedText
    end if
  end if
  return textParts
end appendTextPart

on elementText(elementRef)
  set textParts to {}
  try
    set textParts to my appendTextPart(textParts, name of elementRef)
  end try
  try
    set textParts to my appendTextPart(textParts, description of elementRef)
  end try
  try
    set textParts to my appendTextPart(textParts, value of elementRef)
  end try
  set previousDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to " "
  set joinedText to textParts as text
  set AppleScript's text item delimiters to previousDelimiters
  return joinedText
end elementText

on joinTextList(textItems)
  set previousDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to ", "
  set joinedText to textItems as text
  set AppleScript's text item delimiters to previousDelimiters
  return joinedText
end joinTextList

on noteVisibleLabel(labelText)
  global visibleLabels
  if labelText is not "" then
    set end of visibleLabels to labelText
  end if
end noteVisibleLabel

on clickDescendant(containerRef, targetLabel, remainingDepth)
  if remainingDepth is less than 1 then
    return false
  end if

  set childElements to {}
  try
    tell application "System Events"
      set childElements to UI elements of containerRef
    end tell
  end try

  repeat with childRef in childElements
    set labelText to my elementText(childRef)
    my noteVisibleLabel(labelText)
    if labelText is targetLabel or labelText contains targetLabel then
      tell application "System Events"
        click childRef
      end tell
      delay 0.35
      return true
    end if
    set nextDepth to remainingDepth - 1
    if my clickDescendant(childRef, targetLabel, nextDepth) then
      return true
    end if
  end repeat

  return false
end clickDescendant

on clickExactDescendant(containerRef, targetLabel, remainingDepth)
  if remainingDepth is less than 1 then
    return false
  end if

  set childElements to {}
  try
    tell application "System Events"
      set childElements to UI elements of containerRef
    end tell
  end try

  repeat with childRef in childElements
    set labelText to my elementText(childRef)
    my noteVisibleLabel(labelText)
    if labelText is targetLabel then
      tell application "System Events"
        click childRef
      end tell
      delay 0.35
      return true
    end if
    set nextDepth to remainingDepth - 1
    if my clickExactDescendant(childRef, targetLabel, nextDepth) then
      return true
    end if
  end repeat

  return false
end clickExactDescendant

on playbackControlXOffset(targetLabel)
  if targetLabel is "Shuffle" then
    return -106
  end if
  if targetLabel is "Previous" then
    return -56
  end if
  if targetLabel is "Play" or targetLabel is "Pause" then
    return 0
  end if
  if targetLabel is "Next" then
    return 56
  end if
  if targetLabel is "Repeat" then
    return 106
  end if
  return missing value
end playbackControlXOffset

on playbackControlPoint(targetLabel)
  set controlXOffset to my playbackControlXOffset(targetLabel)
  if controlXOffset is missing value then
    error "Unsupported playback control: " & targetLabel
  end if

  set processName to my findMenuBarProcessName()
  tell application "System Events"
    tell application process processName
      repeat with menuBarRef in menu bars
        repeat with itemRef in menu bar items of menuBarRef
          try
            set menuItems to menu items of menu 1 of itemRef
          on error
            set menuItems to {}
          end try
          repeat with menuItemRef in menuItems
            try
              set itemSize to size of menuItemRef
              if (count of itemSize) is 2 then
                set itemWidth to item 1 of itemSize
                set itemHeight to item 2 of itemSize
                if itemWidth > 300 and itemHeight > 180 then
                  set itemPosition to position of menuItemRef
                  set menuX to item 1 of itemPosition
                  set menuY to item 2 of itemPosition
                  set clickX to menuX + (itemWidth div 2) + controlXOffset
                  set clickY to menuY + 137
                  return (clickX as text) & "," & (clickY as text)
                end if
              end if
            end try
          end repeat
        end repeat
      end repeat
    end tell
  end tell

  error "Playback controls view was not found"
end playbackControlPoint

on openYtmMenu()
  set processName to my findMenuBarProcessName()
  tell application "System Events"
    tell application process processName
      set onlyItemRef to missing value
      set itemCount to 0
      repeat with menuBarRef in menu bars
        repeat with itemRef in menu bar items of menuBarRef
          set itemCount to itemCount + 1
          set onlyItemRef to itemRef
          set labelText to my elementText(itemRef)
          if labelText contains "YTM Enhancer" then
            click itemRef
            delay 0.6
            return
          end if
        end repeat
      end repeat
      if itemCount is 1 and onlyItemRef is not missing value then
        click onlyItemRef
        delay 0.6
        return
      end if
    end tell
  end tell
  error "YTM Enhancer status item was not found"
end openYtmMenu

on clickVisibleElement(targetLabel)
  global visibleLabels
  set processName to my findMenuBarProcessName()
  set visibleLabels to {}
  tell application "System Events"
    tell application process processName
      set deadline to (current date) + 8
      repeat while (current date) is less than deadline
        if my clickExactDescendant(it, targetLabel, 8) then
          return "accessibility exact " & targetLabel
        end if
        delay 0.2
      end repeat
      set deadline to (current date) + 8
      repeat while (current date) is less than deadline
        if my clickDescendant(it, targetLabel, 8) then
          return "accessibility " & targetLabel
        end if
        delay 0.2
      end repeat
    end tell
  end tell
  error "Menu bar element was not found: " & targetLabel & ". Visible labels: " & my joinTextList(visibleLabels)
end clickVisibleElement

on closeOpenMenu()
  tell application "System Events"
    key code 53
  end tell
end closeOpenMenu
`;

const PLAYBACK_CONTROL_LABELS = new Set([
  "Play",
  "Pause",
  "Next",
  "Previous",
  "Shuffle",
  "Repeat",
]);

function postMouseClickScript(x: number, y: number): string {
  return `
import AppKit
import CoreGraphics
import Foundation

let point = CGPoint(x: ${x}, y: ${y})
guard CGPreflightPostEventAccess() else {
  fputs("CoreGraphics event posting is not allowed\\n", stderr)
  exit(2)
}

let source = CGEventSource(stateID: .hidSystemState)
CGWarpMouseCursorPosition(point)
let move = CGEvent(
  mouseEventSource: source,
  mouseType: .mouseMoved,
  mouseCursorPosition: point,
  mouseButton: .left
)
let down = CGEvent(
  mouseEventSource: source,
  mouseType: .leftMouseDown,
  mouseCursorPosition: point,
  mouseButton: .left
)
let up = CGEvent(
  mouseEventSource: source,
  mouseType: .leftMouseUp,
  mouseCursorPosition: point,
  mouseButton: .left
)
move?.post(tap: .cghidEventTap)
Thread.sleep(forTimeInterval: 0.12)
down?.post(tap: .cghidEventTap)
Thread.sleep(forTimeInterval: 0.08)
up?.post(tap: .cghidEventTap)
print("coordinate ${x},${y}")
`;
}

async function installMenuBarApp(
  localAppPath: string,
  extensionId: string,
  extraChromiumManifestDir: string,
): Promise<void> {
  await runShell(
    `
set -euo pipefail
YTM_ENHANCER_LOCAL_APP_PATH=${shLiteral(localAppPath)} \
YTM_ENHANCER_EXTENSION_ORIGINS=${shLiteral(
      `chrome-extension://${extensionId}/`,
    )} \
YTM_ENHANCER_EXTRA_CHROMIUM_MANIFEST_DIRS=${shLiteral(
      extraChromiumManifestDir,
    )} \
  apps/menu-bar/scripts/install-native-hosts.sh
`,
    300_000,
  );
}

async function uninstallMenuBarApp(localAppPath: string): Promise<void> {
  await runShell(
    `
set -euo pipefail
user_id="$(id -u)"
if launchctl print "gui/$user_id" >/dev/null 2>&1; then
  launchctl asuser "$user_id" launchctl unsetenv YTM_MENU_BAR_LOG_PATH >/dev/null 2>&1 || true
  launchctl asuser "$user_id" launchctl unsetenv YTM_MENU_BAR_SCROLL_QA >/dev/null 2>&1 || true
else
  launchctl unsetenv YTM_MENU_BAR_LOG_PATH >/dev/null 2>&1 || true
  launchctl unsetenv YTM_MENU_BAR_SCROLL_QA >/dev/null 2>&1 || true
fi
YTM_ENHANCER_LOCAL_APP_PATH=${shLiteral(localAppPath)} \
  apps/menu-bar/scripts/uninstall-native-hosts.sh
`,
    120_000,
  );
}

async function discoverExtensionId(
  testInfo: Parameters<typeof launchExtensionContext>[0],
): Promise<string> {
  const extension = await launchExtensionContext(testInfo);
  await extension.context.close();
  return extension.extensionId;
}

async function launchMenuBarApp(
  localAppPath: string,
  logPath: string,
): Promise<void> {
  const executablePath = `${localAppPath}/Contents/MacOS/YTMMenuBarConnector`;

  await runShell(
    `
set -euo pipefail
user_id="$(id -u)"
pkill -f ${shLiteral(executablePath)} >/dev/null 2>&1 || true
if launchctl print "gui/$user_id" >/dev/null 2>&1; then
  if ! launchctl asuser "$user_id" open -n \
    --env ${shLiteral(`YTM_MENU_BAR_LOG_PATH=${logPath}`)} \
    --env YTM_MENU_BAR_SCROLL_QA=1 \
    ${shLiteral(localAppPath)}; then
    if ! open -n \
      --env ${shLiteral(`YTM_MENU_BAR_LOG_PATH=${logPath}`)} \
      --env YTM_MENU_BAR_SCROLL_QA=1 \
      ${shLiteral(localAppPath)}; then
      YTM_MENU_BAR_LOG_PATH=${shLiteral(logPath)} YTM_MENU_BAR_SCROLL_QA=1 ${shLiteral(executablePath)} \
        >/tmp/ytm-menu-bar-smoke.out 2>/tmp/ytm-menu-bar-smoke.err &
    fi
  fi
else
  YTM_MENU_BAR_LOG_PATH=${shLiteral(logPath)} YTM_MENU_BAR_SCROLL_QA=1 ${shLiteral(executablePath)} \
    >/tmp/ytm-menu-bar-smoke.out 2>/tmp/ytm-menu-bar-smoke.err &
fi
deadline=$((SECONDS + 20))
while [ "$SECONDS" -lt "$deadline" ]; do
  if pgrep -f ${shLiteral(executablePath)} >/dev/null 2>&1; then
    exit 0
  fi
  sleep 0.5
done
echo "YTM Menu Bar process did not start: ${executablePath}" >&2
exit 1
`,
    60_000,
  );
}

async function clickMenuBarElement(label: string): Promise<void> {
  const isPlaybackControl = PLAYBACK_CONTROL_LABELS.has(label);
  const diagnostic = isPlaybackControl
    ? await clickPlaybackControl(label)
    : await runAppleScript(`
${MENU_BAR_APPLESCRIPT_HELPERS}
my openYtmMenu()
set clickResult to my clickVisibleElement(${appleScriptString(label)})
my closeOpenMenu()
return clickResult
`);
  if (process.env.YTME_E2E_MENU_BAR_DEBUG === "1" && diagnostic.trim()) {
    console.warn(`Menu bar click: ${diagnostic.trim()}`);
  }
}

async function clickPlaybackControl(label: string): Promise<string> {
  try {
    return await runAppleScript(`
${MENU_BAR_APPLESCRIPT_HELPERS}
my openYtmMenu()
set clickResult to my clickVisibleElement(${appleScriptString(label)})
my closeOpenMenu()
return clickResult
`);
  } catch (error) {
    await runAppleScript(`
${MENU_BAR_APPLESCRIPT_HELPERS}
my closeOpenMenu()
`).catch(() => undefined);
    const coordinateDiagnostic = await clickPlaybackControlByCoordinate(label);
    const accessibilityError =
      error instanceof Error ? error.message : String(error);
    return `${coordinateDiagnostic}; accessibility fallback after ${accessibilityError}`;
  }
}

async function clickPlaybackControlByCoordinate(
  label: string,
): Promise<string> {
  const pointText = await runAppleScript(`
${MENU_BAR_APPLESCRIPT_HELPERS}
my openYtmMenu()
return my playbackControlPoint(${appleScriptString(label)})
`);
  const [x, y] = pointText
    .trim()
    .split(",")
    .map((part) => Number(part));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid playback control point: ${pointText}`);
  }

  try {
    return await runSwift(postMouseClickScript(x, y));
  } finally {
    await runAppleScript(`
${MENU_BAR_APPLESCRIPT_HELPERS}
my closeOpenMenu()
`).catch(() => undefined);
  }
}

async function clickMenuBarElementWithoutClosing(label: string): Promise<void> {
  const diagnostic = await runAppleScript(`
${MENU_BAR_APPLESCRIPT_HELPERS}
my openYtmMenu()
return my clickVisibleElement(${appleScriptString(label)})
`);
  if (process.env.YTME_E2E_MENU_BAR_DEBUG === "1" && diagnostic.trim()) {
    console.warn(`Menu bar click: ${diagnostic.trim()}`);
  }
}

async function expectFixtureEvent(
  page: Page,
  eventName: string,
): Promise<void> {
  await expect.poll(() => readFixtureEvents(page)).toContain(eventName);
}

async function expectMenuBarLogContains(
  logPath: string,
  text: string,
): Promise<void> {
  await expect
    .poll(() =>
      runShell(
        `
if [ -f ${shLiteral(logPath)} ]; then
  cat ${shLiteral(logPath)}
fi
`,
        15_000,
      ),
    )
    .toContain(text);
}

async function expectMenuBarScrollAdvanced(logPath: string): Promise<void> {
  await runAppleScript(`
${MENU_BAR_APPLESCRIPT_HELPERS}
my openYtmMenu()
`);
  try {
    await expectMenuBarLogContains(logPath, "metadata scroll advanced");
  } finally {
    await runAppleScript(`
${MENU_BAR_APPLESCRIPT_HELPERS}
my closeOpenMenu()
`).catch(() => undefined);
  }
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

async function setConnectedAppsEnabled(
  extension: ExtensionTestContext,
  enabled: boolean,
): Promise<void> {
  if (extension.firefox) {
    const response = await extension.firefox.sendRuntimeMessage<
      { ok: true } | { ok: false; error: string }
    >({
      type: "set-connected-apps-enabled",
      enabled,
    });
    if (!response.ok) throw new Error(response.error);
    return;
  }

  await extension.popup
    .locator(".nav-item", { hasText: "Connected Apps" })
    .click();
  const toggle = extension.popup.getByLabel("Enable Connected Apps");
  if (enabled) {
    await toggle.check();
  } else {
    await toggle.uncheck();
  }
}

async function menuBarConnectionDiagnostic(
  extension: ExtensionTestContext,
): Promise<string> {
  const label = extension.firefox
    ? ""
    : ((await extension.popup
        .locator(
          `[data-app-id="${FIRST_PARTY_MENU_BAR_CONNECTOR_ID}"] [data-role="connected-app-status"]`,
        )
        .textContent()) ?? "");
  const settings = await readConnectedAppsSettings(extension);
  const firstPartyApp = settings.firstPartyApps.find(
    (app) => app.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
  );
  const connector = settings.connectors.find(
    (app) => app.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
  );

  return JSON.stringify({
    label: label.trim(),
    availability: firstPartyApp?.availability,
    lastError: firstPartyApp?.lastError,
    connectorStatus: connector?.status,
  });
}

async function expectMenuBarConnected(
  extension: ExtensionTestContext,
): Promise<void> {
  await expect
    .poll(() => menuBarConnectionDiagnostic(extension), { timeout: 20_000 })
    .toContain('"connectorStatus":"connected"');
}

async function menuBarAutomationUnavailableReason(): Promise<string | null> {
  try {
    const result = await runAppleScript(
      'tell application "System Events" to return UI elements enabled',
    );
    if (result.trim() === "true") return null;
    return "System Events reports UI elements are not enabled.";
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "System Events automation is unavailable.";
  }
}

function shouldDriveMenuBarButtons(projectName: string): boolean {
  return projectName !== "firefox" || menuBarAutomationRequired();
}

// Playwright requires the first callback parameter to be a destructured fixture object.
// eslint-disable-next-line no-empty-pattern
test("connects the macOS menu bar app through the browser native messaging host", async ({}, testInfo) => {
  test.setTimeout(420_000);
  test.skip(
    !menuBarSmokeEnabled(),
    "Set YTME_E2E_MENU_BAR=1 to run the macOS menu bar connector smoke.",
  );
  test.skip(
    process.platform !== "darwin",
    "The macOS menu bar connector smoke installs macOS native messaging hosts.",
  );
  test.skip(
    !["chromium", "edge", "firefox"].includes(testInfo.project.name),
    "The macOS menu bar connector smoke is scoped to Chromium, Edge, and Firefox.",
  );

  const localAppPath = testInfo.outputPath("YTM Menu Bar.app");
  const menuBarLogPath = testInfo.outputPath("menu-bar.log");
  const chromiumProfileManifestDir = `${extensionUserDataDir(testInfo)}/NativeMessagingHosts`;
  let extension: Awaited<ReturnType<typeof launchExtensionContext>> | undefined;

  try {
    const extensionId = await discoverExtensionId(testInfo);
    await installMenuBarApp(
      localAppPath,
      extensionId,
      chromiumProfileManifestDir,
    );
    extension = await launchExtensionContext(testInfo, {
      env: {
        YTM_MENU_BAR_LOG_PATH: menuBarLogPath,
        YTM_MENU_BAR_SCROLL_QA: "1",
      },
    });
    await launchMenuBarApp(localAppPath, menuBarLogPath);

    const ytmPage = await extension.context.newPage();
    await loadYtmFixtureThroughExtension(
      ytmPage,
      "player-loaded-long-metadata",
    );

    await setConnectedAppsEnabled(extension, true);
    await expectMenuBarConnected(extension);

    if (!shouldDriveMenuBarButtons(testInfo.project.name)) {
      return;
    }

    const automationUnavailableReason =
      await menuBarAutomationUnavailableReason();
    if (automationUnavailableReason && menuBarAutomationRequired()) {
      throw new Error(
        `macOS menu bar automation is unavailable: ${automationUnavailableReason}`,
      );
    }
    if (automationUnavailableReason) {
      console.warn(
        `Skipping macOS menu bar button clicks: ${automationUnavailableReason}`,
      );
    }
    test.skip(
      automationUnavailableReason !== null,
      automationUnavailableReason ?? "",
    );

    await ytmPage.bringToFront();
    await ytmPage.waitForTimeout(2500);
    await expectMenuBarScrollAdvanced(menuBarLogPath);

    await clickMenuBarElement("Play");
    await expectFixtureEvent(ytmPage, "player-play-clicked");
    await expectFixtureEvent(ytmPage, "player-play-pause-clicked");

    await clickMenuBarElement("Next");
    await expectFixtureEvent(ytmPage, "next-clicked");

    await clickMenuBarElement("Previous");
    await expectFixtureEvent(ytmPage, "previous-clicked");

    await clickMenuBarElement("Shuffle");
    await expectFixtureEvent(ytmPage, "shuffle-clicked");

    await clickMenuBarElement("Repeat");
    await expectFixtureEvent(ytmPage, "repeat-clicked");

    await clickMenuBarElement("Focus YouTube Music");
    await expectMenuBarLogContains(menuBarLogPath, "requestId=focus-");

    await clickMenuBarElementWithoutClosing("Quit");
    await expect
      .poll(
        () =>
          runShell(
            `pgrep -f ${shLiteral(
              `${localAppPath}/Contents/MacOS/YTMMenuBarConnector`,
            )} || true`,
            15_000,
          ),
        { timeout: 15_000 },
      )
      .toBe("");
  } finally {
    await extension?.context.close().catch(() => undefined);
    await uninstallMenuBarApp(localAppPath).catch(() => undefined);
  }
});

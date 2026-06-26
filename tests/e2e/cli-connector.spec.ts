import { execFile as execFileCallback } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page, type TestInfo } from "playwright/test";
import { CHROMIUM_LOCAL_DEV_EXTENSION_ID } from "../../src/runtime-messages";
import {
  launchExtensionContext,
  type ExtensionTestContext,
} from "./helpers/extension-context";
import {
  loadYtmFixtureThroughExtension,
  readFixtureEvents,
} from "./helpers/fixtures";

const execFile = promisify(execFileCallback);
const CLI_NATIVE_HOST_NAME = "com.gormanity.ytm_enhancer.cli";

function connectorSmokeEnabled(): boolean {
  return process.env.YTME_E2E_CLI_CONNECTOR === "1";
}

function testEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...overrides };
}

async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<string> {
  const { stdout } = await execFile(command, args, {
    cwd: process.cwd(),
    env,
    timeout: 120_000,
  });
  return stdout;
}

async function runCommandForDiagnostics(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<string> {
  try {
    return await runCommand(command, args, env);
  } catch (error) {
    const commandError = error as Error & {
      stdout?: string;
      stderr?: string;
    };
    return [commandError.stdout, commandError.stderr, commandError.message]
      .filter(Boolean)
      .join("\n");
  }
}

async function installCliNativeHost(
  testInfo: TestInfo,
  env: Record<string, string>,
): Promise<string> {
  const binDir = testInfo.outputPath("bin");
  await mkdir(binDir, { recursive: true });

  await runCommand(
    "bash",
    [resolve(process.cwd(), "apps/cli/scripts/install-native-hosts.sh")],
    {
      ...env,
      YTME_BIN_DIR: binDir,
      YTME_EXTENSION_ORIGINS: `chrome-extension://${CHROMIUM_LOCAL_DEV_EXTENSION_ID}/`,
    },
  );

  return resolve(binDir, "ytme");
}

async function mirrorCliManifestIntoChromiumProfile(
  testInfo: TestInfo,
  xdgConfigHome: string,
): Promise<void> {
  const manifestName = `${CLI_NATIVE_HOST_NAME}.json`;
  const chromiumManifest = resolve(
    xdgConfigHome,
    "chromium",
    "NativeMessagingHosts",
    manifestName,
  );
  const profileNativeHosts = testInfo.outputPath(
    "extension-user-data",
    "NativeMessagingHosts",
  );
  await mkdir(profileNativeHosts, { recursive: true });
  await copyFile(chromiumManifest, resolve(profileNativeHosts, manifestName));
}

async function waitForCliConnection(
  cliPath: string,
  env: Record<string, string>,
): Promise<void> {
  await expect
    .poll(
      async () => {
        return runCommandForDiagnostics(cliPath, ["doctor"], env);
      },
      { timeout: 15_000 },
    )
    .toContain("OK    Connector: connected to YTM Enhancer");
}

async function runYtme(
  cliPath: string,
  args: string[],
  env: Record<string, string>,
): Promise<void> {
  await runCommand(cliPath, args, env);
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

async function expectFixtureEvent(
  page: Page,
  eventName: string,
): Promise<void> {
  await expect.poll(() => readFixtureEvents(page)).toContain(eventName);
}

// Playwright requires the first callback parameter to be a destructured fixture object.
// eslint-disable-next-line no-empty-pattern
test("routes CLI commands through the browser native messaging host", async ({}, testInfo) => {
  test.skip(
    !connectorSmokeEnabled(),
    "Set YTME_E2E_CLI_CONNECTOR=1 to run the CLI connector smoke.",
  );
  test.skip(
    !["darwin", "linux"].includes(process.platform),
    "The CLI connector native-host smoke installs macOS or Linux manifests.",
  );
  test.skip(
    !["chromium", "firefox"].includes(testInfo.project.name),
    "The CLI connector smoke is scoped to Chromium and Firefox.",
  );

  const homeDir = testInfo.outputPath("home");
  const xdgConfigHome = testInfo.outputPath("xdg-config");
  const logPath = testInfo.outputPath("ytme-native-host.log");
  await mkdir(homeDir, { recursive: true });
  await mkdir(xdgConfigHome, { recursive: true });

  const env = testEnv({
    HOME: homeDir,
    NO_COLOR: "1",
    XDG_CONFIG_HOME: xdgConfigHome,
    YTME_LOG_PATH: logPath,
  });
  const cliPath = await installCliNativeHost(testInfo, env);
  if (testInfo.project.name === "chromium") {
    await mirrorCliManifestIntoChromiumProfile(testInfo, xdgConfigHome);
  }

  const extension = await launchExtensionContext(testInfo, { env });
  try {
    await enableConnectedApps(extension);

    const ytmPage = await extension.context.newPage();
    await loadYtmFixtureThroughExtension(ytmPage, "player-loaded-paused");
    await waitForCliConnection(cliPath, env);

    await runYtme(cliPath, ["play"], env);
    await expectFixtureEvent(ytmPage, "player-play-pause-clicked");

    await runYtme(cliPath, ["next"], env);
    await expectFixtureEvent(ytmPage, "next-clicked");

    await runYtme(cliPath, ["previous"], env);
    await expectFixtureEvent(ytmPage, "previous-clicked");

    await loadYtmFixtureThroughExtension(ytmPage, "player-loaded-playing");
    await runYtme(cliPath, ["pause"], env);
    await expectFixtureEvent(ytmPage, "player-play-pause-clicked");
  } finally {
    await runCommand(cliPath, ["daemon", "stop"], env).catch(() => "");
    await extension.context.close();
  }
});

import { execFile as execFileCallback } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page, type TestInfo } from "playwright/test";
import { CHROMIUM_LOCAL_DEV_EXTENSION_ID } from "../../src/runtime-messages";
import { FIRST_PARTY_CLI_CONNECTOR_ID } from "../../src/core/connectors/settings";
import type { ConnectedAppsSettings } from "../../src/core/connectors/client";
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

async function runCommandResult(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; output: string }> {
  try {
    return { exitCode: 0, output: await runCommand(command, args, env) };
  } catch (error) {
    const commandError = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: typeof commandError.code === "number" ? commandError.code : -1,
      output: [commandError.stdout, commandError.stderr]
        .filter(Boolean)
        .join("\n"),
    };
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
  homeDir: string,
  xdgConfigHome: string,
): Promise<void> {
  const manifestName = `${CLI_NATIVE_HOST_NAME}.json`;
  const chromiumManifest =
    process.platform === "darwin"
      ? resolve(
          homeDir,
          "Library/Application Support/Chromium/NativeMessagingHosts",
          manifestName,
        )
      : resolve(
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
  extension?: ExtensionTestContext,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const cliDiagnostic = await runCommandForDiagnostics(
          cliPath,
          ["doctor"],
          env,
        );
        if (!extension || extension.firefox) return cliDiagnostic;
        const appDiagnostic = await extension.popup
          .locator(`[data-app-id="${FIRST_PARTY_CLI_CONNECTOR_ID}"]`)
          .textContent()
          .catch(() => null);
        return `${cliDiagnostic}\nConnected Apps card: ${appDiagnostic ?? "unavailable"}`;
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

async function runYtmeOutput(
  cliPath: string,
  args: string[],
  env: Record<string, string>,
): Promise<string> {
  return runCommand(cliPath, args, env);
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

async function setCliConnectorEnabled(
  extension: ExtensionTestContext,
  enabled: boolean,
): Promise<void> {
  const message = {
    type: "set-connector-enabled",
    connectorId: FIRST_PARTY_CLI_CONNECTOR_ID,
    enabled,
  };
  const response = extension.firefox
    ? await extension.firefox.sendRuntimeMessage<
        { ok: true } | { ok: false; error: string }
      >(message)
    : await extension.popup.evaluate(
        (nextMessage) =>
          chrome.runtime.sendMessage(nextMessage) as Promise<
            { ok: true } | { ok: false; error: string }
          >,
        message,
      );
  if (!response.ok) throw new Error(response.error);
}

async function readConnectedAppsSettings(
  extension: ExtensionTestContext,
): Promise<ConnectedAppsSettings> {
  const message = { type: "get-connected-apps-settings" };
  const response = extension.firefox
    ? await extension.firefox.sendRuntimeMessage<
        { ok: true; data: ConnectedAppsSettings } | { ok: false; error: string }
      >(message)
    : await extension.popup.evaluate(
        (runtimeMessage) =>
          chrome.runtime.sendMessage(runtimeMessage) as Promise<
            | { ok: true; data: ConnectedAppsSettings }
            | { ok: false; error: string }
          >,
        message,
      );
  if (!response.ok) throw new Error(response.error);
  return response.data;
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
    .poll(async () =>
      (await readFixtureEvents(page)).some((event) =>
        event.startsWith(eventPrefix),
      ),
    )
    .toBe(true);
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
  const runtimeDir = await mkdtemp(resolve(tmpdir(), "ytme-e2e-"));
  const logPath = testInfo.outputPath("ytme-native-host.log");
  await mkdir(homeDir, { recursive: true });
  await mkdir(xdgConfigHome, { recursive: true });

  const env = testEnv({
    HOME: homeDir,
    NO_COLOR: "1",
    XDG_CONFIG_HOME: xdgConfigHome,
    YTME_LOG_PATH: logPath,
    YTME_RUNTIME_DIR: runtimeDir,
  });
  const cliPath = await installCliNativeHost(testInfo, env);
  if (testInfo.project.name === "chromium") {
    await mirrorCliManifestIntoChromiumProfile(
      testInfo,
      homeDir,
      xdgConfigHome,
    );
  }

  let extension = await launchExtensionContext(testInfo, { env });
  try {
    await enableConnectedApps(extension);

    const ytmPage = await extension.context.newPage();
    await loadYtmFixtureThroughExtension(ytmPage, "player-loaded-paused");
    await waitForCliConnection(cliPath, env, extension);

    const status = await runYtmeOutput(cliPath, ["status"], env);
    expect(status).toContain("Paused: A Walk - Tycho");

    const statusJson = JSON.parse(
      await runYtmeOutput(cliPath, ["status", "--json"], env),
    ) as { ready?: boolean; state?: { title?: string; artist?: string } };
    expect(statusJson).toMatchObject({
      ready: true,
      state: { title: "A Walk", artist: "Tycho" },
    });

    expect(await runYtmeOutput(cliPath, ["now"], env)).toContain(
      "A Walk - Tycho",
    );
    const nowJson = JSON.parse(
      await runYtmeOutput(cliPath, ["now", "--json"], env),
    ) as { state?: { title?: string } };
    expect(nowJson.state?.title).toBe("A Walk");

    expect(await runYtmeOutput(cliPath, ["doctor"], env)).toContain(
      "OK    Connector: connected to YTM Enhancer",
    );
    expect(await runYtmeOutput(cliPath, ["daemon", "status"], env)).toContain(
      "OK    Connector: connected to YTM Enhancer",
    );
    expect(await runYtmeOutput(cliPath, ["daemon", "start"], env)).toContain(
      "YTM Enhancer CLI daemon is already running.",
    );

    const watchState = JSON.parse(
      (
        await runYtmeOutput(
          cliPath,
          ["watch", "--json", "--count", "1", "--interval", "100ms"],
          env,
        )
      ).trim(),
    ) as { title?: string; artist?: string };
    expect(watchState).toMatchObject({ title: "A Walk", artist: "Tycho" });

    await runYtme(cliPath, ["toggle"], env);
    await expectFixtureEvent(ytmPage, "player-play-pause-clicked");

    await runYtme(cliPath, ["play"], env);

    await runYtme(cliPath, ["next"], env);
    await expectFixtureEvent(ytmPage, "next-clicked");

    await runYtme(cliPath, ["previous"], env);
    await expectFixtureEvent(ytmPage, "previous-clicked");

    await runYtme(cliPath, ["shuffle"], env);
    await expectFixtureEvent(ytmPage, "shuffle-clicked");

    await runYtme(cliPath, ["repeat"], env);
    await expectFixtureEvent(ytmPage, "repeat-clicked");

    await runYtme(cliPath, ["seek", "2:00"], env);
    await expectFixtureEvent(ytmPage, "seek-change:120");

    await runYtme(cliPath, ["seek", "+10"], env);
    await expectFixtureEventPrefix(ytmPage, "seek-change:");

    await runYtme(cliPath, ["focus"], env);

    await loadYtmFixtureThroughExtension(ytmPage, "player-loaded-playing");
    await runYtme(cliPath, ["pause"], env);
    await expectFixtureEvent(ytmPage, "player-play-pause-clicked");

    await loadYtmFixtureThroughExtension(ytmPage, "player-loaded-paused");
    await runYtme(cliPath, ["play"], env);
    await expectFixtureEvent(ytmPage, "player-play-pause-clicked");

    await setCliConnectorEnabled(extension, false);
    const disabledStatus = await runCommandResult(cliPath, ["status"], env);
    expect(disabledStatus.exitCode).not.toBe(0);
    expect(disabledStatus.output).not.toContain("A Walk");
    expect(disabledStatus.output).toMatch(/not connected|not ready|disabled/i);

    const disabledDoctor = await runCommandResult(cliPath, ["doctor"], env);
    expect(disabledDoctor.exitCode).not.toBe(0);
    expect(disabledDoctor.output).not.toContain(
      "OK    Connector: connected to YTM Enhancer",
    );
    expect(disabledDoctor.output).toMatch(/not connected|not ready|disabled/i);

    await expect
      .poll(() => runCommandForDiagnostics(cliPath, ["daemon", "start"], env), {
        timeout: 5_000,
      })
      .toContain("YTM Enhancer CLI daemon is not running.");

    await extension.context.close();
    extension = await launchExtensionContext(testInfo, { env });
    await expect
      .poll(async () => {
        const settings = await readConnectedAppsSettings(extension);
        const connector = settings.connectors.find(
          (candidate) => candidate.id === FIRST_PARTY_CLI_CONNECTOR_ID,
        );
        return {
          enabled: connector?.enabled,
          globalEnabled: settings.enabled,
          status: connector?.status,
        };
      })
      .toEqual({ enabled: false, globalEnabled: true, status: "blocked" });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await expect
      .poll(() => runCommandForDiagnostics(cliPath, ["daemon", "start"], env), {
        timeout: 5_000,
      })
      .toContain("YTM Enhancer CLI daemon is not running.");

    await setCliConnectorEnabled(extension, true);
    await waitForCliConnection(cliPath, env, extension);

    await runYtme(cliPath, ["daemon", "stop"], env);
    await expect
      .poll(() => runCommandForDiagnostics(cliPath, ["daemon", "start"], env), {
        timeout: 5_000,
      })
      .toContain("YTM Enhancer CLI daemon is not running.");
  } finally {
    await runCommand(cliPath, ["daemon", "stop"], env).catch(() => "");
    await extension.context.close();
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

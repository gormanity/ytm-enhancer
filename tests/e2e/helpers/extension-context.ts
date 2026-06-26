import net from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chromium,
  firefox,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "playwright/test";
import { CHROMIUM_LOCAL_DEV_EXTENSION_ID } from "../../../src/runtime-messages";
import { browserTargetFromProjectName } from "./content-script-harness";

const FIREFOX_EXTENSION_ID = "ytm-enhancer@gormanity";
const MARIONETTE_CONNECT_TIMEOUT_MS = 10_000;
const MARIONETTE_PACKET_TIMEOUT_MS = 10_000;
const FIREFOX_EXTENSION_UUID_TIMEOUT_MS = 10_000;

export interface ExtensionTestContext {
  context: BrowserContext;
  extensionId: string;
  extensionIds: string[];
  firefox?: FirefoxExtensionController;
  popup: Page;
}

export interface LaunchExtensionContextOptions {
  env?: Record<string, string>;
  mode?: "dev" | "prod-and-dev";
}

export interface FirefoxExtensionController {
  extensionUuid: string;
  sendRuntimeMessage<T = unknown>(message: unknown): Promise<T>;
}

type MarionetteResponse = [1, number, unknown, unknown];

class FirefoxMarionetteClient {
  private buffer = "";
  private nextMessageId = 0;

  private constructor(private readonly socket: net.Socket) {}

  static async connect(port: number): Promise<FirefoxMarionetteClient> {
    const deadline = Date.now() + MARIONETTE_CONNECT_TIMEOUT_MS;
    let lastError: Error | null = null;

    while (Date.now() < deadline) {
      try {
        const socket = await connectTcp(port);
        const client = new FirefoxMarionetteClient(socket);
        await client.readPacket();
        return client;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await delay(250);
      }
    }

    throw new Error(
      `Timed out connecting to Firefox Marionette on port ${port}: ${
        lastError?.message ?? "unknown error"
      }`,
    );
  }

  async command<T = unknown>(
    name: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const messageId = ++this.nextMessageId;
    const body = JSON.stringify([0, messageId, name, params]);
    this.socket.write(`${Buffer.byteLength(body)}:${body}`);

    const response = (await this.readPacket()) as MarionetteResponse;
    const [, responseId, error, result] = response;
    if (responseId !== messageId) {
      throw new Error(
        `Firefox Marionette response id ${responseId} did not match command id ${messageId}`,
      );
    }
    if (error !== null) {
      throw new Error(JSON.stringify(error));
    }
    return result as T;
  }

  close(): void {
    this.socket.end();
  }

  private readPacket(): Promise<unknown> {
    const packet = this.extractPacket();
    if (packet !== null) return Promise.resolve(packet);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out reading Firefox Marionette packet"));
      }, MARIONETTE_PACKET_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timeout);
        this.socket.off("data", onData);
        this.socket.off("error", onError);
      };

      const onData = (chunk: Buffer | string) => {
        this.buffer += chunk.toString();
        const nextPacket = this.extractPacket();
        if (nextPacket === null) return;

        cleanup();
        resolve(nextPacket);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      this.socket.on("data", onData);
      this.socket.on("error", onError);
    });
  }

  private extractPacket(): unknown | null {
    const separatorIndex = this.buffer.indexOf(":");
    if (separatorIndex < 0) return null;

    const packetLength = Number(this.buffer.slice(0, separatorIndex));
    if (!Number.isFinite(packetLength)) {
      throw new Error(`Invalid Firefox Marionette packet: ${this.buffer}`);
    }

    const packetStart = separatorIndex + 1;
    const packetEnd = packetStart + packetLength;
    if (this.buffer.length < packetEnd) return null;

    const packet = this.buffer.slice(packetStart, packetEnd);
    this.buffer = this.buffer.slice(packetEnd);
    return JSON.parse(packet);
  }
}

function mergedBrowserEnv(
  overrides: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!overrides) return undefined;

  return Object.fromEntries(
    Object.entries({ ...process.env, ...overrides }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function devExtensionPathForProject(projectName: string): string {
  return resolve(
    process.cwd(),
    "dist-dev",
    browserTargetFromProjectName(projectName),
  );
}

function browserChannelForProject(projectName: string): string | undefined {
  if (projectName === "edge") return "msedge";
  return "chromium";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectTcp(port: number): Promise<net.Socket> {
  const socket = net.createConnection({ host: "127.0.0.1", port });
  socket.setEncoding("utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

async function availableTcpPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to allocate a Firefox Marionette port.");
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  return address.port;
}

export function extensionUserDataDir(testInfo: TestInfo): string {
  return testInfo.outputPath("extension-user-data");
}

async function writeFirefoxMarionettePrefs(
  userDataDir: string,
  port: number,
): Promise<void> {
  await writeFile(
    resolve(userDataDir, "user.js"),
    [
      `user_pref("marionette.port", ${port});`,
      'user_pref("xpinstall.signatures.required", false);',
      "",
    ].join("\n"),
  );
}

function parseFirefoxExtensionUuid(
  prefsContent: string,
  extensionId: string,
): string | null {
  const line = prefsContent
    .split("\n")
    .find((entry) => entry.includes("extensions.webextensions.uuids"));
  const escapedJson = line?.match(
    /user_pref\("extensions\.webextensions\.uuids", "(.*)"\);/,
  )?.[1];
  if (!escapedJson) return null;

  const uuidMap = JSON.parse(JSON.parse(`"${escapedJson}"`)) as Record<
    string,
    string
  >;
  return uuidMap[extensionId] ?? null;
}

async function waitForFirefoxExtensionUuid(
  userDataDir: string,
  extensionId: string,
): Promise<string> {
  const deadline = Date.now() + FIREFOX_EXTENSION_UUID_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const prefsContent = await readFile(
        resolve(userDataDir, "prefs.js"),
        "utf-8",
      );
      const extensionUuid = parseFirefoxExtensionUuid(
        prefsContent,
        extensionId,
      );
      if (extensionUuid) return extensionUuid;
    } catch {
      // Firefox may not have flushed prefs.js yet.
    }
    await delay(250);
  }

  throw new Error(`Firefox did not expose a UUID for ${extensionId}.`);
}

async function launchFirefoxExtensionContext(
  testInfo: TestInfo,
  options: LaunchExtensionContextOptions,
): Promise<ExtensionTestContext> {
  if (options.mode === "prod-and-dev") {
    throw new Error(
      "Firefox extension E2E does not support prod-and-dev mode.",
    );
  }

  const userDataDir = extensionUserDataDir(testInfo);
  await mkdir(userDataDir, { recursive: true });
  const marionettePort = await availableTcpPort();
  await writeFirefoxMarionettePrefs(userDataDir, marionettePort);

  const context = await firefox.launchPersistentContext(userDataDir, {
    args: ["--marionette"],
    env: mergedBrowserEnv(options.env),
    firefoxUserPrefs: {
      "xpinstall.signatures.required": false,
    },
  });

  let marionette: FirefoxMarionetteClient | null = null;
  try {
    marionette = await FirefoxMarionetteClient.connect(marionettePort);
    await marionette.command("WebDriver:NewSession", { capabilities: {} });
    await marionette.command("WebDriver:SetTimeouts", {
      implicit: 0,
      pageLoad: 10_000,
      script: 10_000,
    });
    await marionette.command("Addon:Install", {
      path: devExtensionPathForProject("firefox"),
      temporary: true,
    });
    const extensionUuid = await waitForFirefoxExtensionUuid(
      userDataDir,
      FIREFOX_EXTENSION_ID,
    );
    await marionette.command("WebDriver:Navigate", {
      url: `moz-extension://${extensionUuid}/popup.html`,
    });

    const firefoxController: FirefoxExtensionController = {
      extensionUuid,
      sendRuntimeMessage<T = unknown>(message: unknown) {
        return marionette!
          .command<{ value: T }>("WebDriver:ExecuteAsyncScript", {
            script: `
const message = arguments[0];
const done = arguments[arguments.length - 1];
browser.runtime.sendMessage(message).then(done, (error) => {
  done({ ok: false, error: error?.message ?? String(error) });
});
`,
            args: [message],
          })
          .then((result) => result.value);
      },
    };

    const closeContext = context.close.bind(context);
    context.close = async (...args: Parameters<BrowserContext["close"]>) => {
      marionette?.close();
      await closeContext(...args);
    };

    const popup = context.pages()[0] ?? (await context.newPage());
    return {
      context,
      extensionId: FIREFOX_EXTENSION_ID,
      extensionIds: [FIREFOX_EXTENSION_ID],
      firefox: firefoxController,
      popup,
    };
  } catch (error) {
    marionette?.close();
    await context.close().catch(() => undefined);
    throw error;
  }
}

export async function launchExtensionContext(
  testInfo: TestInfo,
  modeOrOptions: "dev" | "prod-and-dev" | LaunchExtensionContextOptions = "dev",
): Promise<ExtensionTestContext> {
  const options =
    typeof modeOrOptions === "string" ? { mode: modeOrOptions } : modeOrOptions;
  const mode = options.mode ?? "dev";
  if (testInfo.project.name === "firefox") {
    return launchFirefoxExtensionContext(testInfo, { ...options, mode });
  }

  const devExtensionPath = devExtensionPathForProject(testInfo.project.name);
  const extensionPaths =
    mode === "prod-and-dev"
      ? [resolve(process.cwd(), "dist", "chrome"), devExtensionPath]
      : [devExtensionPath];
  const userDataDir = extensionUserDataDir(testInfo);
  await mkdir(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: browserChannelForProject(testInfo.project.name),
    env: mergedBrowserEnv(options.env),
    args: [
      `--disable-extensions-except=${extensionPaths.join(",")}`,
      `--load-extension=${extensionPaths.join(",")}`,
    ],
  });

  while (context.serviceWorkers().length < extensionPaths.length) {
    await context.waitForEvent("serviceworker");
  }
  const extensionIds = context
    .serviceWorkers()
    .map((worker) => new URL(worker.url()).host);
  const extensionId =
    mode === "prod-and-dev"
      ? extensionIds.find((id) => id !== CHROMIUM_LOCAL_DEV_EXTENSION_ID) ||
        extensionIds[0]
      : extensionIds[0];
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  return { context, extensionId, extensionIds, popup };
}

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chromium,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "playwright/test";
import { CHROMIUM_LOCAL_DEV_EXTENSION_ID } from "../../../src/runtime-messages";
import { browserTargetFromProjectName } from "./content-script-harness";

export interface ExtensionTestContext {
  context: BrowserContext;
  extensionId: string;
  extensionIds: string[];
  popup: Page;
}

export interface LaunchExtensionContextOptions {
  env?: Record<string, string>;
  mode?: "dev" | "prod-and-dev";
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

export async function launchExtensionContext(
  testInfo: TestInfo,
  modeOrOptions: "dev" | "prod-and-dev" | LaunchExtensionContextOptions = "dev",
): Promise<ExtensionTestContext> {
  const options =
    typeof modeOrOptions === "string" ? { mode: modeOrOptions } : modeOrOptions;
  const mode = options.mode ?? "dev";
  const devExtensionPath = devExtensionPathForProject(testInfo.project.name);
  const extensionPaths =
    mode === "prod-and-dev"
      ? [resolve(process.cwd(), "dist", "chrome"), devExtensionPath]
      : [devExtensionPath];
  const userDataDir = testInfo.outputPath("extension-user-data");
  await mkdir(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: browserChannelForProject(testInfo.project.name),
    env: options.env,
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

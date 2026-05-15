import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chromium,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "playwright/test";
import { browserTargetFromProjectName } from "./content-script-harness";

export interface ExtensionTestContext {
  context: BrowserContext;
  extensionId: string;
  popup: Page;
}

function extensionPathForProject(projectName: string): string {
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
): Promise<ExtensionTestContext> {
  const extensionPath = extensionPathForProject(testInfo.project.name);
  const userDataDir = testInfo.outputPath("extension-user-data");
  await mkdir(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: browserChannelForProject(testInfo.project.name),
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const serviceWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(serviceWorker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  return { context, extensionId, popup };
}

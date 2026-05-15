import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright/test";
import {
  browserTargetFromProjectName,
  injectBuiltContentScript,
  installContentScriptHarness,
  type RuntimeMessageResponse,
} from "./content-script-harness";

async function loadFixtureHtml(name: string): Promise<string> {
  return readFile(
    resolve(process.cwd(), "tests/e2e/fixtures", `${name}.html`),
    "utf-8",
  );
}

export async function loadYtmFixture(
  page: Page,
  projectName: string,
  name: string,
  options: {
    runtimeResponses?: Record<string, RuntimeMessageResponse>;
  } = {},
): Promise<void> {
  await installContentScriptHarness(page, options.runtimeResponses);

  await page.route(
    "https://music.youtube.com/playlist?list=fixture",
    async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: await loadFixtureHtml(name),
      });
    },
  );

  await page.goto("/playlist?list=fixture");
  await injectBuiltContentScript(
    page,
    browserTargetFromProjectName(projectName),
  );
}

export async function readFixtureEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__ytmTestEvents ?? []);
}

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

async function routeDemoArtwork(page: Page): Promise<void> {
  const artworkRoutes = [
    ["demo-current-artwork.png", "demo-current-artwork.png"],
    ["demo-next-artwork.png", "demo-next-artwork.png"],
  ] as const;

  for (const [urlPath, fileName] of artworkRoutes) {
    const fixtureUrl = `https://ytm-enhancer.local/${urlPath}`;
    await page.unroute(fixtureUrl).catch(() => undefined);
    await page.route(fixtureUrl, async (route) => {
      await route.fulfill({
        contentType: "image/png",
        path: resolve(
          process.cwd(),
          "packages/connector-ui-assets/demo-artwork",
          fileName,
        ),
      });
    });
  }
}

export async function loadYtmFixtureThroughExtension(
  page: Page,
  name: string,
): Promise<void> {
  const fixtureUrl = "https://music.youtube.com/playlist?list=fixture";
  await page.unroute(fixtureUrl).catch(() => undefined);
  await routeDemoArtwork(page);
  await page.route(fixtureUrl, async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: await loadFixtureHtml(name),
    });
  });

  await page.goto("/playlist?list=fixture");
  await page.waitForLoadState("domcontentloaded");
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
  await routeDemoArtwork(page);

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

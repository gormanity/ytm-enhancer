import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "playwright/test";
import type { Page } from "playwright/test";
import {
  browserTargetFromProjectName,
  injectBuiltContentScript,
  installContentScriptHarness,
} from "./helpers/content-script-harness";

async function loadFixture(name: string): Promise<string> {
  return readFile(
    resolve(process.cwd(), "tests/e2e/fixtures", `${name}.html`),
    "utf-8",
  );
}

async function loadYtmFixture(page: Page, projectName: string, name: string) {
  await installContentScriptHarness(page);

  await page.route(
    "https://music.youtube.com/playlist?list=fixture",
    async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: await loadFixture(name),
      });
    },
  );

  await page.goto("/playlist?list=fixture");
  await injectBuiltContentScript(
    page,
    browserTargetFromProjectName(projectName),
  );
}

async function dispatchPlaybackAction(
  page: Page,
  action: "togglePlay" | "play" | "pause" | "next" | "previous",
) {
  await page.evaluate(async (playbackAction) => {
    await window.__ytmEnhancerDispatchRuntimeMessage?.({
      type: "playback-action",
      action: playbackAction,
    });
  }, action);
}

async function readEvents(page: Page) {
  return page.evaluate(() => window.__ytmTestEvents ?? []);
}

test("togglePlay starts an unstarted playlist fixture", async ({ page }) => {
  await loadYtmFixture(page, test.info().project.name, "playlist-unstarted");

  await dispatchPlaybackAction(page, "togglePlay");

  await expect.poll(() => readEvents(page)).toContain("page-play-clicked");
});

test("play uses the player bar when a paused track is loaded", async ({
  page,
}) => {
  await loadYtmFixture(page, test.info().project.name, "player-loaded-paused");

  await dispatchPlaybackAction(page, "play");

  await expect
    .poll(() => readEvents(page))
    .toContain("player-play-pause-clicked");
  await expect.poll(() => readEvents(page)).not.toContain("page-play-clicked");
});

test("pause uses the player bar when a track is playing", async ({ page }) => {
  await loadYtmFixture(page, test.info().project.name, "player-loaded-playing");

  await dispatchPlaybackAction(page, "pause");

  await expect
    .poll(() => readEvents(page))
    .toContain("player-play-pause-clicked");
  await expect.poll(() => readEvents(page)).not.toContain("page-play-clicked");
});

test("next and previous use player bar controls", async ({ page }) => {
  await loadYtmFixture(page, test.info().project.name, "player-loaded-paused");

  await dispatchPlaybackAction(page, "next");
  await dispatchPlaybackAction(page, "previous");

  await expect.poll(() => readEvents(page)).toContain("next-clicked");
  await expect.poll(() => readEvents(page)).toContain("previous-clicked");
});

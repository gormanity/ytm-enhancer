import { expect, test } from "playwright/test";
import type { Page } from "playwright/test";
import { dispatchRuntimeMessage } from "./helpers/content-script-harness";
import { loadYtmFixture, readFixtureEvents } from "./helpers/fixtures";

async function dispatchPlaybackAction(
  page: Page,
  action: "togglePlay" | "play" | "pause" | "next" | "previous",
) {
  await dispatchRuntimeMessage(page, {
    type: "playback-action",
    action,
  });
}

test("togglePlay starts an unstarted playlist fixture", async ({ page }) => {
  await loadYtmFixture(page, test.info().project.name, "playlist-unstarted");

  await dispatchPlaybackAction(page, "togglePlay");

  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("page-play-clicked");
});

test("play uses the player bar when a paused track is loaded", async ({
  page,
}) => {
  await loadYtmFixture(page, test.info().project.name, "player-loaded-paused");

  await dispatchPlaybackAction(page, "play");

  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("player-play-pause-clicked");
  await expect
    .poll(() => readFixtureEvents(page))
    .not.toContain("page-play-clicked");
});

test("pause uses the player bar when a track is playing", async ({ page }) => {
  await loadYtmFixture(page, test.info().project.name, "player-loaded-playing");

  await dispatchPlaybackAction(page, "pause");

  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("player-play-pause-clicked");
  await expect
    .poll(() => readFixtureEvents(page))
    .not.toContain("page-play-clicked");
});

test("next and previous use player bar controls", async ({ page }) => {
  await loadYtmFixture(page, test.info().project.name, "player-loaded-paused");

  await dispatchPlaybackAction(page, "next");
  await dispatchPlaybackAction(page, "previous");

  await expect.poll(() => readFixtureEvents(page)).toContain("next-clicked");
  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("previous-clicked");
});

import { expect, test } from "playwright/test";
import { readRuntimeMessages } from "./helpers/content-script-harness";
import { loadYtmFixture, readFixtureEvents } from "./helpers/fixtures";
import type { Page } from "playwright/test";

async function loadAutoPlayFixture(page: Page, name: string) {
  await loadYtmFixture(page, test.info().project.name, name, {
    runtimeResponses: {
      "get-auto-play-mode": {
        ok: true,
        data: "on",
      },
    },
  });
}

test("clicks page play when enabled on an unstarted page", async ({ page }) => {
  await loadAutoPlayFixture(page, "auto-play-page-start");

  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("page-play-clicked");
});

test("plays ready loaded media when enabled", async ({ page }) => {
  await loadAutoPlayFixture(page, "auto-play-ready-video");

  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("video-play-called");
  await expect
    .poll(() => readRuntimeMessages(page))
    .toContainEqual({
      type: "set-auto-play-policy-blocked",
      blocked: false,
    });
});

test("reports browser autoplay policy blocks", async ({ page }) => {
  await loadAutoPlayFixture(page, "auto-play-policy-blocked");

  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("video-play-called");
  await expect
    .poll(() => readRuntimeMessages(page))
    .toContainEqual({
      type: "set-auto-play-policy-blocked",
      blocked: true,
    });
  await expect
    .poll(() => readFixtureEvents(page))
    .not.toContain("player-play-pause-clicked");
});

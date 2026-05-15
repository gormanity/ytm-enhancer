import { expect, test } from "playwright/test";
import { dispatchRuntimeMessage } from "./helpers/content-script-harness";
import { loadYtmFixture, readFixtureEvents } from "./helpers/fixtures";

declare global {
  interface Window {
    __ytmFixtureLoadDislikedTrack?: () => void;
  }
}

test("skips a newly loaded disliked track when enabled", async ({ page }) => {
  await loadYtmFixture(
    page,
    test.info().project.name,
    "auto-skip-disliked-track-change",
  );
  await dispatchRuntimeMessage(page, {
    type: "set-auto-skip-disliked-enabled",
    enabled: true,
  });

  await page.waitForTimeout(250);
  await page.evaluate(() => window.__ytmFixtureLoadDislikedTrack?.());

  await expect.poll(() => readFixtureEvents(page)).toContain("next-clicked");
});

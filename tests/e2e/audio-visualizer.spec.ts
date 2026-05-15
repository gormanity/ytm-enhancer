import { expect, test } from "playwright/test";
import type { Page } from "playwright/test";
import {
  dispatchRuntimeMessage,
  readRuntimeMessages,
} from "./helpers/content-script-harness";
import { loadYtmFixture, readFixtureEvents } from "./helpers/fixtures";

async function loadVisualizerFixture(page: Page) {
  await loadYtmFixture(
    page,
    test.info().project.name,
    "audio-visualizer-surfaces",
    {
      runtimeResponses: {
        "inject-audio-bridge": { ok: true },
      },
    },
  );
}

test("attaches and removes visualizer canvases", async ({ page }) => {
  await loadVisualizerFixture(page);

  await dispatchRuntimeMessage(page, {
    type: "set-audio-visualizer-target",
    target: "all",
  });
  await dispatchRuntimeMessage(page, {
    type: "set-audio-visualizer-enabled",
    enabled: true,
  });

  await expect.poll(() => page.locator("canvas").count()).toBe(2);
  await expect
    .poll(() => readRuntimeMessages(page))
    .toContainEqual({ type: "inject-audio-bridge" });
  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("audio-bridge:resume");

  await dispatchRuntimeMessage(page, {
    type: "set-audio-visualizer-enabled",
    enabled: false,
  });

  await expect.poll(() => page.locator("canvas").count()).toBe(0);
  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("audio-bridge:stop");
});

import { expect, test } from "playwright/test";
import {
  dispatchRuntimeMessage,
  readRuntimeMessages,
} from "./helpers/content-script-harness";
import { loadYtmFixture, readFixtureEvents } from "./helpers/fixtures";

test("gets and sets stream quality through the page bridge", async ({
  page,
}) => {
  await loadYtmFixture(
    page,
    test.info().project.name,
    "stream-quality-bridge",
    {
      runtimeResponses: {
        "inject-quality-bridge": { ok: true },
      },
    },
  );

  await expect
    .poll(() =>
      dispatchRuntimeMessage(page, {
        type: "get-stream-quality",
      }),
    )
    .toEqual({ ok: true, data: { current: "2" } });

  await expect
    .poll(() => readRuntimeMessages(page))
    .toContainEqual({ type: "inject-quality-bridge" });
  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("quality-bridge:get-quality:2");

  await dispatchRuntimeMessage(page, {
    type: "set-stream-quality",
    value: "3",
  });

  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("quality-bridge:set-quality:3");

  await expect
    .poll(() =>
      dispatchRuntimeMessage(page, {
        type: "get-stream-quality",
      }),
    )
    .toEqual({ ok: true, data: { current: "3" } });
});

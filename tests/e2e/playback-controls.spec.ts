import { expect, test } from "playwright/test";
import { dispatchRuntimeMessage } from "./helpers/content-script-harness";
import { loadYtmFixture, readFixtureEvents } from "./helpers/fixtures";

test("reads playback state from a loaded player bar", async ({ page }) => {
  await loadYtmFixture(
    page,
    test.info().project.name,
    "playback-controls-loaded",
  );

  const responses = await dispatchRuntimeMessage(page, {
    type: "get-playback-state",
  });

  expect(responses).toEqual({
    ok: true,
    data: {
      title: "Fixture Track",
      artist: "Fixture Artist",
      album: "Fixture Album",
      year: 2026,
      artworkUrl: "https://lh3.googleusercontent.com/fixture=w544-h544-l90-rj",
      nextTrack: null,
      isPlaying: true,
      progress: 83,
      duration: 296,
      isShuffling: false,
      repeatMode: "off",
    },
  });
});

test("gets and sets playback speed", async ({ page }) => {
  await loadYtmFixture(
    page,
    test.info().project.name,
    "playback-controls-loaded",
  );

  await expect
    .poll(() =>
      dispatchRuntimeMessage(page, {
        type: "get-playback-speed",
      }),
    )
    .toEqual({ ok: true, data: 1.25 });

  await dispatchRuntimeMessage(page, {
    type: "set-playback-speed",
    rate: 1.75,
  });

  await expect
    .poll(() =>
      dispatchRuntimeMessage(page, {
        type: "get-playback-speed",
      }),
    )
    .toEqual({ ok: true, data: 1.75 });
});

test("gets and sets precision volume", async ({ page }) => {
  await loadYtmFixture(
    page,
    test.info().project.name,
    "playback-controls-loaded",
  );

  await expect
    .poll(() =>
      dispatchRuntimeMessage(page, {
        type: "get-volume",
      }),
    )
    .toEqual({ ok: true, data: 0.35 });

  await dispatchRuntimeMessage(page, {
    type: "set-volume",
    volume: 0.42,
  });

  await expect
    .poll(() => readFixtureEvents(page))
    .toContain("volume-changed:42");
  await expect
    .poll(() =>
      dispatchRuntimeMessage(page, {
        type: "get-volume",
      }),
    )
    .toEqual({ ok: true, data: 0.42 });
});

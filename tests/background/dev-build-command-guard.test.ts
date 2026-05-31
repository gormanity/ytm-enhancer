import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  resolve(process.cwd(), "src/background/index.ts"),
  "utf-8",
);
const notificationsModuleSource = readFileSync(
  resolve(process.cwd(), "src/modules/notifications/index.ts"),
  "utf-8",
);
const playbackControlsModuleSource = readFileSync(
  resolve(process.cwd(), "src/modules/playback-controls/index.ts"),
  "utf-8",
);

function handlerBody(type: string): string {
  const start = backgroundSource.indexOf(`handler.on("${type}"`);
  if (start < 0) return "";
  const next = backgroundSource.indexOf("\nhandler.on(", start + 1);
  return backgroundSource.slice(start, next < 0 ? undefined : next);
}

describe("dev build conflict command guards", () => {
  it("does not bypass duplicate guards through the unguarded relay helper", () => {
    expect(backgroundSource).not.toContain("relayToYTMTab");
  });

  it("routes YTM tab actions through the guarded runtime client", () => {
    expect(backgroundSource).toContain(
      "isActionSuppressedForDevBuildConflict(devBuildConflictState, tabId)",
    );
    expect(notificationsModuleSource).toContain(
      "context.ytm.getPlaybackState()",
    );
    expect(playbackControlsModuleSource).toContain(
      "createYtmPlaybackDriver(context.ytm)",
    );
    expect(playbackControlsModuleSource).toContain(
      "playbackController.executeAction(action)",
    );
    expect(playbackControlsModuleSource).toContain("context.ytm.focusTab()");
    expect(handlerBody("focus-ytm-tab")).toContain(
      "ytm.focusTab(requestedTabId)",
    );
  });

  it("routes direct content queries through the guarded runtime client", () => {
    expect(handlerBody("get-ytm-tab-artwork")).toContain("ytm.getTabArtwork");
    expect(handlerBody("get-stream-quality")).toContain("ytm.getStreamQuality");
    expect(handlerBody("get-playback-speed")).toContain("ytm.getPlaybackSpeed");
    expect(handlerBody("get-volume")).toContain("ytm.getVolume");
    expect(handlerBody("get-playback-state")).toContain("ytm.getPlaybackState");
    for (const type of [
      "get-ytm-tab-artwork",
      "get-stream-quality",
      "get-playback-speed",
      "get-volume",
      "get-playback-state",
    ]) {
      expect(handlerBody(type)).not.toContain("chrome.tabs.sendMessage");
    }
  });
});

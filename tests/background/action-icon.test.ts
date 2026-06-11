import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  getActionIconPath,
  setActionPlaybackIndicator,
} from "@/background/action-icon";

describe("action icon playback indicator", () => {
  it("returns idle, playing, and disabled action icon paths", () => {
    expect(getActionIconPath("idle")).toEqual({
      16: "icon16.png",
      48: "icon48.png",
      128: "icon128.png",
    });
    expect(getActionIconPath("playing")).toEqual({
      16: "icon16-playing.png",
      48: "icon48-playing.png",
      128: "icon128-playing.png",
    });
    expect(getActionIconPath("disabled")).toEqual({
      16: "icon16-disabled.png",
      48: "icon48-disabled.png",
      128: "icon128-disabled.png",
    });
  });

  it("sets the playing browser action icon without using a badge", async () => {
    const setIcon = vi.fn(() => Promise.resolve());
    const setBadgeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("chrome", {
      action: {
        setIcon,
        setBadgeText,
      },
    });

    await setActionPlaybackIndicator(true, false);

    expect(setIcon).toHaveBeenCalledWith({
      path: {
        16: "icon16-playing.png",
        48: "icon48-playing.png",
        128: "icon128-playing.png",
      },
    });
    expect(setBadgeText).not.toHaveBeenCalled();
  });

  it("leaves the dev-build conflict icon alone while actions are suppressed", async () => {
    const setIcon = vi.fn(() => Promise.resolve());
    vi.stubGlobal("chrome", {
      action: {
        setIcon,
      },
    });

    await setActionPlaybackIndicator(true, true);

    expect(setIcon).not.toHaveBeenCalled();
  });

  it("builds idle action icons with spokes and playing icons with an outer ring", () => {
    const configSource = readFileSync(
      resolve(process.cwd(), "vite.config.shared.ts"),
      "utf-8",
    );
    const icon = readFileSync(
      resolve(process.cwd(), "src/assets/icon.svg"),
      "utf-8",
    );

    expect(configSource).not.toContain("icon-idle.svg");
    expect(configSource).toContain("createPlayingIcon");
    expect(configSource).toContain("playingRingSvg");
    expect(configSource).toContain('PLAYING_RING_COLOR = "#F03030"');
    expect(configSource).toContain("icon${size}-playing.png");
    expect(configSource).not.toContain("playingDotSvg");
    expect(icon).toContain("<line ");
  });
});

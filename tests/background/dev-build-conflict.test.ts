import { describe, expect, it, vi } from "vitest";
import {
  getActionIconPath,
  isActionSuppressedForDevBuildConflict,
  isDevBuildConflictActive,
  setActionDevBuildConflictIndicator,
  shouldForwardHotkeyToDevBuild,
  updateDevBuildSuspendedTab,
} from "@/background/dev-build-conflict";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("dev build conflict background helpers", () => {
  it("tracks whether a tab suspension state changed", () => {
    const suspendedTabIds = new Set<number>();

    expect(updateDevBuildSuspendedTab(suspendedTabIds, 12, true)).toBe(true);
    expect(updateDevBuildSuspendedTab(suspendedTabIds, 12, true)).toBe(false);
    expect(suspendedTabIds.has(12)).toBe(true);

    expect(updateDevBuildSuspendedTab(suspendedTabIds, 12, false)).toBe(true);
    expect(updateDevBuildSuspendedTab(suspendedTabIds, 12, false)).toBe(false);
    expect(suspendedTabIds.has(12)).toBe(false);
  });

  it("suppresses actions only for suspended tabs", () => {
    const suspendedTabIds = new Set([12]);
    const state = { suspendedTabIds, externalDevBuildPresent: false };

    expect(isActionSuppressedForDevBuildConflict(state, 12)).toBe(true);
    expect(isActionSuppressedForDevBuildConflict(state, 13)).toBe(false);
    expect(isActionSuppressedForDevBuildConflict(state, undefined)).toBe(false);
  });

  it("suppresses all actions while external dev build presence is fresh", () => {
    const state = {
      suspendedTabIds: new Set<number>(),
      externalDevBuildPresent: true,
    };

    expect(isDevBuildConflictActive(state)).toBe(true);
    expect(isActionSuppressedForDevBuildConflict(state, undefined)).toBe(true);
    expect(isActionSuppressedForDevBuildConflict(state, 13)).toBe(true);
  });

  it("forwards hotkeys only when a production build is disabled by dev", () => {
    const onState = {
      suspendedTabIds: new Set<number>(),
      externalDevBuildPresent: false,
    };
    const offState = {
      suspendedTabIds: new Set([12]),
      externalDevBuildPresent: false,
    };

    expect(shouldForwardHotkeyToDevBuild(onState, false)).toBe(false);
    expect(shouldForwardHotkeyToDevBuild(offState, false)).toBe(true);
    expect(shouldForwardHotkeyToDevBuild(offState, true)).toBe(false);
  });

  it("returns normal and disabled action icon paths", () => {
    expect(getActionIconPath(false)).toEqual({
      16: "icon16.png",
      48: "icon48.png",
      128: "icon128.png",
    });
    expect(getActionIconPath(true)).toEqual({
      16: "icon16-disabled.png",
      48: "icon48-disabled.png",
      128: "icon128-disabled.png",
    });
  });

  it("sets a disabled browser action indicator for production builds", async () => {
    const pendingSetIcon = deferred();
    const setIcon = vi.fn(() => pendingSetIcon.promise);
    const setTitle = vi.fn(() => Promise.resolve());
    const setBadgeText = vi.fn(() => Promise.resolve());
    const setBadgeBackgroundColor = vi.fn(() => Promise.resolve());
    vi.stubGlobal("chrome", {
      action: {
        setIcon,
        setTitle,
        setBadgeText,
        setBadgeBackgroundColor,
      },
    });

    const indicatorPromise = setActionDevBuildConflictIndicator(true, false);

    expect(setIcon).toHaveBeenCalledWith({
      path: {
        16: "icon16-disabled.png",
        48: "icon48-disabled.png",
        128: "icon128-disabled.png",
      },
    });
    expect(setTitle).toHaveBeenCalledWith({
      title: "YTM Enhancer disabled while the dev build is active",
    });
    expect(setBadgeText).toHaveBeenCalledWith({ text: "OFF" });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#555555",
    });

    let settled = false;
    void indicatorPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    pendingSetIcon.resolve();
    await indicatorPromise;
    expect(settled).toBe(true);
  });

  it("does not set the browser action indicator for dev builds", async () => {
    const setIcon = vi.fn(() => Promise.resolve());
    const setTitle = vi.fn(() => Promise.resolve());
    const setBadgeText = vi.fn(() => Promise.resolve());
    const setBadgeBackgroundColor = vi.fn(() => Promise.resolve());
    vi.stubGlobal("chrome", {
      action: {
        setIcon,
        setTitle,
        setBadgeText,
        setBadgeBackgroundColor,
      },
    });

    await setActionDevBuildConflictIndicator(true, true);

    expect(setIcon).not.toHaveBeenCalled();
    expect(setTitle).not.toHaveBeenCalled();
    expect(setBadgeText).not.toHaveBeenCalled();
    expect(setBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});

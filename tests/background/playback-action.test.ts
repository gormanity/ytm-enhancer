import { describe, expect, it, vi } from "vitest";
import { handlePlaybackActionMessage } from "@/background/playback-action";
import type { YtmRuntimeClient } from "@/core/ytm-client";

function createYtmClient(): YtmRuntimeClient {
  return {
    listTabs: vi.fn(),
    selectTab: vi.fn(),
    focusTab: vi.fn(),
    getTabArtwork: vi.fn(),
    getPlaybackState: vi.fn(),
    executePlaybackAction: vi.fn().mockResolvedValue(undefined),
    seekTo: vi.fn().mockResolvedValue(undefined),
    getVolume: vi.fn(),
    setVolume: vi.fn(),
    getPlaybackSpeed: vi.fn(),
    setPlaybackSpeed: vi.fn(),
    getStreamQuality: vi.fn(),
    setStreamQuality: vi.fn(),
    broadcast: vi.fn(),
  };
}

describe("handlePlaybackActionMessage", () => {
  it("targets playback actions to the sending tab when available", async () => {
    const ytm = createYtmClient();

    const response = await handlePlaybackActionMessage(
      { type: "playback-action", action: "next" },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      ytm,
    );

    expect(response).toEqual({ ok: true });
    expect(ytm.executePlaybackAction).toHaveBeenCalledWith("next", {
      kind: "tab",
      tabId: 42,
    });
  });

  it("prefers an explicit tab ID over the sending tab", async () => {
    const ytm = createYtmClient();

    await handlePlaybackActionMessage(
      { type: "playback-action", action: "previous", tabId: 7 },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      ytm,
    );

    expect(ytm.executePlaybackAction).toHaveBeenCalledWith("previous", {
      kind: "tab",
      tabId: 7,
    });
  });

  it("targets seeks to the sending tab when available", async () => {
    const ytm = createYtmClient();

    const response = await handlePlaybackActionMessage(
      { type: "playback-action", action: "seekTo", time: 91 },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      ytm,
    );

    expect(response).toEqual({ ok: true });
    expect(ytm.seekTo).toHaveBeenCalledWith(91, {
      kind: "tab",
      tabId: 42,
    });
  });

  it("rejects invalid seek times", async () => {
    const ytm = createYtmClient();

    const response = await handlePlaybackActionMessage(
      { type: "playback-action", action: "seekTo" },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      ytm,
    );

    expect(response).toEqual({ ok: false, error: "Invalid seek time" });
    expect(ytm.seekTo).not.toHaveBeenCalled();
  });
});

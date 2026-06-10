import { describe, expect, it, vi } from "vitest";
import { handleTrackChangedMessage } from "@/background/track-change";
import type { PlaybackState } from "@/core/types";

function makeState(): PlaybackState {
  return {
    title: "Song Title",
    artist: "Artist Name",
    album: "Album",
    year: 2024,
    artworkUrl: "https://example.com/art.jpg",
    isPlaying: true,
    progress: 0,
    duration: 200,
  };
}

describe("track-changed background handling", () => {
  it("should publish playback updates to connected apps", () => {
    const state = makeState();
    const publishPlaybackState = vi.fn();
    const notifications = { clearCurrent: vi.fn(), handleTrackChange: vi.fn() };
    const miniPlayer = {
      syncPipOpenState: vi.fn(),
      isSuppressNotificationsWhilePipOpenEnabled: vi.fn(() => false),
      hasOpenPipWindow: vi.fn(() => false),
    };

    const response = handleTrackChangedMessage(
      { type: "track-changed", state, pipOpen: false },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      {
        isYTMTabSuppressed: () => false,
        miniPlayer,
        notifications,
        publishPlaybackState,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(publishPlaybackState).toHaveBeenCalledWith(state);
  });

  it("should not publish playback updates from suppressed tabs", () => {
    const publishPlaybackState = vi.fn();
    const notifications = { clearCurrent: vi.fn(), handleTrackChange: vi.fn() };
    const miniPlayer = {
      syncPipOpenState: vi.fn(),
      isSuppressNotificationsWhilePipOpenEnabled: vi.fn(() => false),
      hasOpenPipWindow: vi.fn(() => false),
    };

    const response = handleTrackChangedMessage(
      { type: "track-changed", state: makeState(), pipOpen: false },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      {
        isYTMTabSuppressed: () => true,
        miniPlayer,
        notifications,
        publishPlaybackState,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(publishPlaybackState).not.toHaveBeenCalled();
  });

  it("should suppress notifications when the message reports PiP is open", () => {
    let pipOpen = false;
    const notifications = { clearCurrent: vi.fn(), handleTrackChange: vi.fn() };
    const miniPlayer = {
      syncPipOpenState: vi.fn((_tabId: number | undefined, open: unknown) => {
        pipOpen = open === true;
      }),
      isSuppressNotificationsWhilePipOpenEnabled: vi.fn(() => true),
      hasOpenPipWindow: vi.fn(() => pipOpen),
    };

    const response = handleTrackChangedMessage(
      { type: "track-changed", state: makeState(), pipOpen: true },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      {
        isYTMTabSuppressed: () => false,
        miniPlayer,
        notifications,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(miniPlayer.syncPipOpenState).toHaveBeenCalledWith(42, true);
    expect(notifications.clearCurrent).toHaveBeenCalled();
    expect(notifications.handleTrackChange).not.toHaveBeenCalled();
  });

  it("should suppress notifications when the current message reports PiP open before stored state updates", () => {
    const notifications = { clearCurrent: vi.fn(), handleTrackChange: vi.fn() };
    const miniPlayer = {
      syncPipOpenState: vi.fn(),
      isSuppressNotificationsWhilePipOpenEnabled: vi.fn(() => true),
      hasOpenPipWindow: vi.fn(() => false),
    };

    const response = handleTrackChangedMessage(
      { type: "track-changed", state: makeState(), pipOpen: true },
      {} as chrome.runtime.MessageSender,
      {
        isYTMTabSuppressed: () => false,
        miniPlayer,
        notifications,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(notifications.clearCurrent).toHaveBeenCalled();
    expect(notifications.handleTrackChange).not.toHaveBeenCalled();
  });

  it("should show notifications when PiP is open but suppression is disabled", () => {
    const state = makeState();
    const notifications = { clearCurrent: vi.fn(), handleTrackChange: vi.fn() };
    const miniPlayer = {
      syncPipOpenState: vi.fn(),
      isSuppressNotificationsWhilePipOpenEnabled: vi.fn(() => false),
      hasOpenPipWindow: vi.fn(() => true),
    };

    const response = handleTrackChangedMessage(
      { type: "track-changed", state, pipOpen: true },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      {
        isYTMTabSuppressed: () => false,
        miniPlayer,
        notifications,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(notifications.clearCurrent).not.toHaveBeenCalled();
    expect(notifications.handleTrackChange).toHaveBeenCalledWith(state);
  });
});

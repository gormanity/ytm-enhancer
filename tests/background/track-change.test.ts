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
  it("should suppress notifications when the message reports PiP is open", () => {
    let pipOpen = false;
    const notifications = { handleTrackChange: vi.fn() };
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
    expect(notifications.handleTrackChange).not.toHaveBeenCalled();
  });
});

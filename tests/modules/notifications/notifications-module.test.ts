import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationsModule } from "@/modules/notifications";
import type { PlaybackState } from "@/core/types";

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    title: "Song Title",
    artist: "Artist Name",
    album: "Album",
    artworkUrl: "https://example.com/art.jpg",
    isPlaying: true,
    progress: 0,
    duration: 200,
    ...overrides,
  };
}

describe("NotificationsModule", () => {
  let module: NotificationsModule;
  let createMock: ReturnType<typeof vi.fn>;
  let clearMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createMock = vi.fn();
    clearMock = vi.fn();

    vi.stubGlobal("chrome", {
      notifications: {
        create: createMock,
        clear: clearMock,
      },
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://fake-id/${path}`),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    module = new NotificationsModule();
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("notifications");
    expect(module.name).toBe("Notifications");
  });

  it("should be enabled by default", () => {
    expect(module.isEnabled()).toBe(true);
  });

  it("should show a notification when track changes", () => {
    const state = makeState();

    module.handleTrackChange(state);

    expect(createMock).toHaveBeenCalledWith(
      "ytm-enhancer-now-playing",
      {
        type: "basic",
        title: "Song Title",
        message: "Artist Name",
        iconUrl: "https://example.com/art.jpg",
      },
      expect.any(Function),
    );
  });

  it("should not show a notification when disabled", () => {
    module.setEnabled(false);

    module.handleTrackChange(makeState());

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should not show a notification when title is null", () => {
    module.handleTrackChange(makeState({ title: null }));

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should not show a notification when artist is null", () => {
    module.handleTrackChange(makeState({ artist: null }));

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should show notification again for the same track", () => {
    const state = makeState();

    module.handleTrackChange(state);
    createMock.mockClear();
    module.handleTrackChange(state);

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("should clear previous notification before showing new one", () => {
    module.handleTrackChange(makeState());
    clearMock.mockClear();
    module.handleTrackChange(makeState());

    expect(clearMock).toHaveBeenCalledWith(
      "ytm-enhancer-now-playing",
      expect.any(Function),
    );
  });

  it("should use fallback icon when artworkUrl is null", () => {
    module.handleTrackChange(makeState({ artworkUrl: null }));

    expect(createMock).toHaveBeenCalledWith(
      "ytm-enhancer-now-playing",
      expect.objectContaining({
        iconUrl: "chrome-extension://fake-id/icon48.png",
      }),
      expect.any(Function),
    );
  });

  it("should upgrade artwork URL to larger size", () => {
    module.handleTrackChange(
      makeState({
        artworkUrl: "https://lh3.googleusercontent.com/abc=w60-h60-l90-rj",
      }),
    );

    expect(createMock).toHaveBeenCalledWith(
      "ytm-enhancer-now-playing",
      expect.objectContaining({
        iconUrl: "https://lh3.googleusercontent.com/abc=w256-h256-l90-rj",
      }),
      expect.any(Function),
    );
  });

  it("should provide popup views", () => {
    const views = module.getPopupViews();

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("notifications-settings");
  });
});

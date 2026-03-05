import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationsModule } from "@/modules/notifications";
import type { PlaybackState } from "@/core/types";

const ID_PREFIX = "ytm-enhancer-now-playing-";

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    title: "Song Title",
    artist: "Artist Name",
    album: "Album",
    year: 2024,
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
    // Invoke the callback synchronously so create() fires in tests
    clearMock = vi.fn((_id: string, cb?: () => void) => cb?.());

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
      expect.stringContaining(ID_PREFIX),
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

  it("should not show notification for the same track by default", () => {
    const state = makeState();

    module.handleTrackChange(state);
    createMock.mockClear();
    module.handleTrackChange(state);

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should show notification on unpause when notifyOnUnpause is enabled", () => {
    const state = makeState();

    module.setNotifyOnUnpause(true);
    module.handleTrackChange(state);
    createMock.mockClear();
    module.handleTrackChange(state);

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("should not show notification on unpause when notifyOnUnpause is disabled", () => {
    const state = makeState();

    module.setNotifyOnUnpause(false);
    module.handleTrackChange(state);
    createMock.mockClear();
    module.handleTrackChange(state);

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should have notifyOnUnpause disabled by default", () => {
    expect(module.isNotifyOnUnpauseEnabled()).toBe(false);
  });

  it("should clear previous notification before showing new one", () => {
    const state1 = makeState({ title: "Song A" });
    const state2 = makeState({ title: "Song B" });

    module.handleTrackChange(state1);
    const firstId = createMock.mock.calls[0][0] as string;
    clearMock.mockClear();
    createMock.mockClear();

    module.handleTrackChange(state2);

    // Previous notification is cleared before creating the new one
    expect(clearMock).toHaveBeenCalledWith(firstId, expect.any(Function));
    expect(createMock).toHaveBeenCalledWith(
      expect.stringContaining(ID_PREFIX),
      expect.objectContaining({ title: "Song B" }),
      expect.any(Function),
    );
  });

  it("should use unique notification IDs", () => {
    module.handleTrackChange(makeState({ title: "Song A" }));
    module.handleTrackChange(makeState({ title: "Song B" }));

    const id1 = createMock.mock.calls[0][0] as string;
    const id2 = createMock.mock.calls[1][0] as string;

    expect(id1).toContain(ID_PREFIX);
    expect(id2).toContain(ID_PREFIX);
    expect(id1).not.toBe(id2);
  });

  it("should use fallback icon when artworkUrl is null", () => {
    module.handleTrackChange(makeState({ artworkUrl: null }));

    expect(createMock).toHaveBeenCalledWith(
      expect.stringContaining(ID_PREFIX),
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
      expect.stringContaining(ID_PREFIX),
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

  it("should use dedicated preview artwork for test notifications", () => {
    module.triggerPreview();

    expect(createMock).toHaveBeenCalledWith(
      expect.stringContaining(ID_PREFIX),
      expect.objectContaining({
        title: "Test Track",
        iconUrl: "chrome-extension://fake-id/preview-artwork.png",
      }),
      expect.any(Function),
    );
  });

  it("should use fallback icon for preview when artwork field is disabled", () => {
    module.setFields({
      title: true,
      artist: true,
      album: false,
      year: false,
      artwork: false,
    });

    module.triggerPreview();

    expect(createMock).toHaveBeenCalledWith(
      expect.stringContaining(ID_PREFIX),
      expect.objectContaining({
        iconUrl: "chrome-extension://fake-id/icon48.png",
      }),
      expect.any(Function),
    );
  });

  describe("notification fields", () => {
    it("should have default fields", () => {
      expect(module.getFields()).toEqual({
        title: true,
        artist: true,
        album: false,
        year: false,
        artwork: true,
      });
    });

    it("should allow setting fields", () => {
      module.setFields({
        title: true,
        artist: false,
        album: true,
        year: true,
        artwork: false,
      });

      expect(module.getFields()).toEqual({
        title: true,
        artist: false,
        album: true,
        year: true,
        artwork: false,
      });
    });

    it("should use 'Now Playing' as title when title field is disabled", () => {
      module.setFields({
        title: false,
        artist: true,
        album: false,
        year: false,
        artwork: true,
      });

      module.handleTrackChange(makeState());

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({ title: "Now Playing" }),
        expect.any(Function),
      );
    });

    it("should show only artist in message when only artist is enabled", () => {
      module.setFields({
        title: true,
        artist: true,
        album: false,
        year: false,
        artwork: true,
      });

      module.handleTrackChange(makeState());

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({ message: "Artist Name" }),
        expect.any(Function),
      );
    });

    it("should join artist, album, and year with dashes in message", () => {
      module.setFields({
        title: true,
        artist: true,
        album: true,
        year: true,
        artwork: true,
      });

      module.handleTrackChange(makeState({ album: "My Album", year: 2024 }));

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({
          message: "Artist Name \u2014 My Album \u2014 2024",
        }),
        expect.any(Function),
      );
    });

    it("should show only album in message when only album is enabled", () => {
      module.setFields({
        title: true,
        artist: false,
        album: true,
        year: false,
        artwork: true,
      });

      module.handleTrackChange(makeState({ album: "My Album" }));

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({ message: "My Album" }),
        expect.any(Function),
      );
    });

    it("should show only year in message when only year is enabled", () => {
      module.setFields({
        title: true,
        artist: false,
        album: false,
        year: true,
        artwork: true,
      });

      module.handleTrackChange(makeState({ year: 2024 }));

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({ message: "2024" }),
        expect.any(Function),
      );
    });

    it("should use fallback message when no message fields are enabled", () => {
      module.setFields({
        title: true,
        artist: false,
        album: false,
        year: false,
        artwork: true,
      });

      module.handleTrackChange(makeState());

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({
          message: "Previewing notification settings",
        }),
        expect.any(Function),
      );
    });

    it("should use fallback icon when artwork field is disabled", () => {
      module.setFields({
        title: true,
        artist: true,
        album: false,
        year: false,
        artwork: false,
      });

      module.handleTrackChange(makeState());

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({
          iconUrl: "chrome-extension://fake-id/icon48.png",
        }),
        expect.any(Function),
      );
    });

    it("should skip null album in message", () => {
      module.setFields({
        title: true,
        artist: true,
        album: true,
        year: false,
        artwork: true,
      });

      module.handleTrackChange(makeState({ album: null }));

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({ message: "Artist Name" }),
        expect.any(Function),
      );
    });

    it("should use fallback message when year is enabled but missing", () => {
      module.setFields({
        title: true,
        artist: false,
        album: false,
        year: true,
        artwork: true,
      });

      module.handleTrackChange(makeState({ year: null }));

      expect(createMock).toHaveBeenCalledWith(
        expect.stringContaining(ID_PREFIX),
        expect.objectContaining({
          message: "Previewing notification settings",
        }),
        expect.any(Function),
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotificationsModule } from "@/modules/notifications";
import type { PlaybackState } from "@/core/types";

const NOTIFICATION_ID = "ytm-enhancer-now-playing";

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

/** Flush the 150ms delay between clear and create. */
function flushNotificationDelay(): void {
  vi.advanceTimersByTime(150);
}

describe("NotificationsModule", () => {
  let module: NotificationsModule;
  let createMock: ReturnType<typeof vi.fn>;
  let clearMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    createMock = vi.fn();
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

  afterEach(() => {
    vi.useRealTimers();
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
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
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
    flushNotificationDelay();

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should not show a notification when title is null", () => {
    module.handleTrackChange(makeState({ title: null }));
    flushNotificationDelay();

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should not show a notification when artist is null", () => {
    module.handleTrackChange(makeState({ artist: null }));
    flushNotificationDelay();

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should not show notification for the same track by default", () => {
    const state = makeState();

    module.handleTrackChange(state);
    flushNotificationDelay();
    createMock.mockClear();
    module.handleTrackChange(state);
    flushNotificationDelay();

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should show notification on unpause when notifyOnUnpause is enabled", () => {
    const state = makeState();

    module.setNotifyOnUnpause(true);
    module.handleTrackChange(state);
    flushNotificationDelay();
    createMock.mockClear();
    module.handleTrackChange(state);
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("should not show notification on unpause when notifyOnUnpause is disabled", () => {
    const state = makeState();

    module.setNotifyOnUnpause(false);
    module.handleTrackChange(state);
    flushNotificationDelay();
    createMock.mockClear();
    module.handleTrackChange(state);
    flushNotificationDelay();

    expect(createMock).not.toHaveBeenCalled();
  });

  it("should have notifyOnUnpause disabled by default", () => {
    expect(module.isNotifyOnUnpauseEnabled()).toBe(false);
  });

  it("should reuse the same static notification ID across tracks", () => {
    module.handleTrackChange(makeState({ title: "Song A" }));
    flushNotificationDelay();
    module.handleTrackChange(makeState({ title: "Song B" }));
    flushNotificationDelay();

    const id1 = createMock.mock.calls[0][0] as string;
    const id2 = createMock.mock.calls[1][0] as string;

    expect(id1).toBe(NOTIFICATION_ID);
    expect(id2).toBe(NOTIFICATION_ID);
  });

  it("should clear the static ID then create after a delay to force a fresh toast", () => {
    module.handleTrackChange(makeState({ title: "Song A" }));

    // Clear fires immediately
    expect(clearMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.any(Function),
    );
    // Create has not fired yet (waiting on 150ms delay)
    expect(createMock).not.toHaveBeenCalled();

    flushNotificationDelay();

    // Now create fires
    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({ title: "Song A" }),
      expect.any(Function),
    );
  });

  it("should use fallback icon when artworkUrl is null", () => {
    module.handleTrackChange(makeState({ artworkUrl: null }));
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
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
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
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
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
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
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
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
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
        expect.objectContaining({
          message: "Previewing notification settings",
        }),
        expect.any(Function),
      );
    });
  });

  describe("showReminder", () => {
    it("should show a notification regardless of enabled state", () => {
      module.setEnabled(false);

      module.showReminder(makeState());
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
        expect.objectContaining({ title: "Song Title" }),
        expect.any(Function),
      );
    });

    it("should show a notification for the same track repeatedly", () => {
      const state = makeState();

      module.showReminder(state);
      flushNotificationDelay();
      createMock.mockClear();
      module.showReminder(state);
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it("should respect field settings", () => {
      module.setFields({
        title: true,
        artist: true,
        album: true,
        year: false,
        artwork: true,
      });

      module.showReminder(makeState({ album: "My Album" }));
      flushNotificationDelay();

      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
        expect.objectContaining({
          message: "Artist Name \u2014 My Album",
        }),
        expect.any(Function),
      );
    });

    it("should not show a notification when title is null", () => {
      module.showReminder(makeState({ title: null }));
      flushNotificationDelay();

      expect(createMock).not.toHaveBeenCalled();
    });

    it("should not show a notification when artist is null", () => {
      module.showReminder(makeState({ artist: null }));
      flushNotificationDelay();

      expect(createMock).not.toHaveBeenCalled();
    });
  });
});

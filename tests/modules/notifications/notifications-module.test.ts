import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestModuleContext } from "../../helpers/module-context";
import { NotificationsModule } from "@/modules/notifications";
import type { ModuleContext, PlaybackState } from "@/core/types";
import type { YtmRuntimeClient } from "@/core/ytm-client";
import { createRuntimeClient } from "@/core/messaging";
import { createShortcutCommandClient } from "@/core/commands";

const NOTIFICATION_ID = "ytm-enhancer-now-playing";

interface TestHotkeyRegistry {
  register: ReturnType<typeof vi.fn>;
}

interface TestHotkeyModule {
  registerHotkeys?(registry: TestHotkeyRegistry, context: ModuleContext): void;
}

interface TestNotificationClickRegistry {
  register: ReturnType<typeof vi.fn>;
}

interface TestNotificationClickModule {
  registerNotificationClicks?(
    registry: TestNotificationClickRegistry,
    context: ModuleContext,
  ): void;
}

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

function createModuleContext(
  ytmOverrides: Partial<YtmRuntimeClient> = {},
): ModuleContext {
  return {
    events: {} as ModuleContext["events"],
    popup: {} as ModuleContext["popup"],
    capabilities: {} as ModuleContext["capabilities"],
    runtime: createRuntimeClient(),
    state: { saveValue: vi.fn() },
    storage: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    extension: {
      getVersion: vi.fn(() => "0.0.0"),
      getUrl: vi.fn((path: string) => `context-extension://${path}`),
    },
    commands: createShortcutCommandClient(),
    alarms: {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
    },
    notifications: {
      create: vi.fn(
        async (
          idOrOptions:
            | string
            | {
                type: "basic";
                title: string;
                message: string;
                iconUrl: string;
              },
          maybeOptions?: {
            type: "basic";
            title: string;
            message: string;
            iconUrl: string;
          },
        ) => {
          if (typeof idOrOptions === "string") {
            chrome.notifications.create(
              idOrOptions,
              maybeOptions!,
              () => undefined,
            );
            return idOrOptions;
          }

          chrome.notifications.create(idOrOptions, () => undefined);
          return "notification-id";
        },
      ),
      clear: vi.fn(async (id: string) => {
        chrome.notifications.clear(id);
        return true;
      }),
    },
    popupEvents: { broadcast: vi.fn() },
    ytm: {
      listTabs: vi.fn(),
      selectTab: vi.fn(),
      focusTab: vi.fn(),
      getTabArtwork: vi.fn(),
      getPlaybackState: vi.fn(),
      executePlaybackAction: vi.fn(),
      seekTo: vi.fn(),
      getVolume: vi.fn(),
      setVolume: vi.fn(),
      getPlaybackSpeed: vi.fn(),
      setPlaybackSpeed: vi.fn(),
      getStreamQuality: vi.fn(),
      setStreamQuality: vi.fn(),
      broadcast: vi.fn(),
      ...ytmOverrides,
    },
  };
}

describe("NotificationsModule", () => {
  let module: NotificationsModule;
  let createMock: ReturnType<typeof vi.fn>;
  let clearMock: ReturnType<typeof vi.fn>;
  let onClickedAddListener: ReturnType<typeof vi.fn>;
  let onClickedRemoveListener: ReturnType<typeof vi.fn>;
  let tabsQuery: ReturnType<typeof vi.fn>;
  let tabsUpdate: ReturnType<typeof vi.fn>;
  let windowsUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    createMock = vi.fn();
    clearMock = vi.fn((_id: string, cb?: () => void) => cb?.());
    onClickedAddListener = vi.fn();
    onClickedRemoveListener = vi.fn();
    tabsQuery = vi.fn();
    tabsUpdate = vi.fn().mockResolvedValue(undefined);
    windowsUpdate = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("chrome", {
      notifications: {
        create: createMock,
        clear: clearMock,
        onClicked: {
          addListener: onClickedAddListener,
          removeListener: onClickedRemoveListener,
        },
      },
      tabs: {
        query: tabsQuery,
        update: tabsUpdate,
      },
      windows: {
        update: windowsUpdate,
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
    module.init(createModuleContext());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
        silent: true,
      },
      expect.any(Function),
    );
  });

  it("should use the injected notification client when track changes", () => {
    const notifications = {
      create: vi.fn().mockResolvedValue(NOTIFICATION_ID),
      clear: vi.fn().mockResolvedValue(true),
    };
    const context = { ...createModuleContext(), notifications };
    module.init(context);

    module.handleTrackChange(makeState({ title: "Injected Client Song" }));
    flushNotificationDelay();

    expect(notifications.clear).toHaveBeenCalledWith(NOTIFICATION_ID);
    expect(notifications.create).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({ title: "Injected Client Song" }),
    );
    expect(createMock).not.toHaveBeenCalled();
    expect(clearMock).not.toHaveBeenCalled();
  });

  it("should mark notifications silent so the OS does not chime each track", () => {
    module.handleTrackChange(makeState());
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({ silent: true }),
      expect.any(Function),
    );
  });

  it("should omit silent on Firefox because it prevents notifications from appearing", () => {
    const context = createModuleContext();
    context.capabilities.runtime = "firefox";
    module.init(context);

    module.handleTrackChange(makeState());
    flushNotificationDelay();

    const options = createMock.mock.calls[0][1] as Record<string, unknown>;
    expect(options.silent).toBeUndefined();
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
    expect(clearMock).toHaveBeenCalledWith(NOTIFICATION_ID);
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

  it("should still create the notification when clear's callback never fires", () => {
    // Firefox returns a Promise from notifications.clear and may not invoke
    // a passed callback. The previous pattern nested create() inside the
    // clear callback, so notifications never appeared on Firefox.
    clearMock.mockImplementation((_id: string) => {
      // Firefox-style: ignore any callback, return a (never-resolving) Promise.
      return new Promise(() => {});
    });

    module.handleTrackChange(makeState({ title: "Firefox Song" }));
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({ title: "Firefox Song" }),
      expect.any(Function),
    );
  });

  it("should use fallback icon when artworkUrl is null", () => {
    module.init(createModuleContext());

    module.handleTrackChange(makeState({ artworkUrl: null }));
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({
        iconUrl: "context-extension://icon48.png",
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
    const views = module.getPopupViews(createTestModuleContext());

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("notifications-settings");
  });

  it("should use dedicated preview artwork for test notifications", () => {
    module.init(createModuleContext());

    module.triggerPreview();
    flushNotificationDelay();

    expect(createMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      expect.objectContaining({
        title: "Test Track",
        iconUrl: "context-extension://preview-artwork.png",
      }),
      expect.any(Function),
    );
  });

  it("should use fallback icon for preview when artwork field is disabled", () => {
    module.init(createModuleContext());

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
        iconUrl: "context-extension://icon48.png",
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
      module.init(createModuleContext());

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
          iconUrl: "context-extension://icon48.png",
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
    it("should register the reminder hotkey through the module registry", async () => {
      const state = makeState({ title: "Reminder Song" });
      const getPlaybackState = vi.fn().mockResolvedValue(state);
      const context = createModuleContext({ getPlaybackState });
      const registry: TestHotkeyRegistry = { register: vi.fn() };

      (module as TestHotkeyModule).registerHotkeys?.(registry, context);

      expect(registry.register).toHaveBeenCalledWith(
        "remind-me",
        expect.any(Function),
      );

      const handler = registry.register.mock.calls[0]?.[1] as
        | (() => Promise<void>)
        | undefined;
      await handler?.();
      flushNotificationDelay();

      expect(getPlaybackState).toHaveBeenCalled();
      expect(createMock).toHaveBeenCalledWith(
        NOTIFICATION_ID,
        expect.objectContaining({ title: "Reminder Song" }),
        expect.any(Function),
      );
    });

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

  describe("click-to-focus", () => {
    it("should register a module-owned notification click handler", async () => {
      const focusTab = vi.fn().mockResolvedValue(undefined);
      const notifications = {
        create: vi.fn().mockResolvedValue(NOTIFICATION_ID),
        clear: vi.fn().mockResolvedValue(true),
      };
      const context = { ...createModuleContext({ focusTab }), notifications };
      const registry: TestNotificationClickRegistry = { register: vi.fn() };

      (module as TestNotificationClickModule).registerNotificationClicks?.(
        registry,
        context,
      );

      expect(registry.register).toHaveBeenCalledWith(
        NOTIFICATION_ID,
        expect.any(Function),
      );

      const handler = registry.register.mock.calls[0]?.[1] as (
        id: string,
      ) => Promise<void>;

      await handler(NOTIFICATION_ID);

      expect(notifications.clear).toHaveBeenCalledWith(NOTIFICATION_ID);
      await vi.waitFor(() => {
        expect(focusTab).toHaveBeenCalled();
      });
    });

    it("should clear the notification after click so the toast disappears", async () => {
      const notifications = {
        create: vi.fn().mockResolvedValue(NOTIFICATION_ID),
        clear: vi.fn().mockResolvedValue(true),
      };
      const context = { ...createModuleContext(), notifications };
      const registry: TestNotificationClickRegistry = { register: vi.fn() };

      (module as TestNotificationClickModule).registerNotificationClicks?.(
        registry,
        context,
      );

      const handler = registry.register.mock.calls[0]?.[1] as (
        id: string,
      ) => Promise<void>;

      await handler(NOTIFICATION_ID);

      expect(notifications.clear).toHaveBeenCalledWith(NOTIFICATION_ID);
    });

    it("should ignore focus failures from the context YTM client", async () => {
      const focusTab = vi.fn().mockRejectedValue(new Error("No YTM tab"));
      const context = createModuleContext({ focusTab });
      const registry: TestNotificationClickRegistry = { register: vi.fn() };

      (module as TestNotificationClickModule).registerNotificationClicks?.(
        registry,
        context,
      );

      const handler = registry.register.mock.calls[0]?.[1] as (
        id: string,
      ) => Promise<void>;

      await handler(NOTIFICATION_ID);
      await vi.waitFor(() => {
        expect(focusTab).toHaveBeenCalled();
      });
    });
  });
});

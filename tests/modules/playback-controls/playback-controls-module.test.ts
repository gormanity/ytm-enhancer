import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestModuleContext } from "../../helpers/module-context";
import { PlaybackControlsModule } from "@/modules/playback-controls";
import type { ModuleContext } from "@/core/types";
import type { MessageResponse, ModuleHandlerRegistry } from "@/core/messaging";

interface TestHotkeyRegistry {
  register: ReturnType<typeof vi.fn>;
}

interface TestHotkeyModule {
  registerHotkeys?(registry: TestHotkeyRegistry, context: ModuleContext): void;
}

function createModuleHandlerRegistry() {
  const handlers = new Map<
    string,
    (
      message: Record<string, unknown>,
      sender: chrome.runtime.MessageSender,
    ) => Promise<MessageResponse>
  >();
  const registry: ModuleHandlerRegistry = {
    on(type, handler) {
      handlers.set(
        type,
        handler as typeof handlers extends Map<unknown, infer H> ? H : never,
      );
    },
  };

  return { handlers, registry };
}

describe("PlaybackControlsModule", () => {
  let module: PlaybackControlsModule;

  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    module = new PlaybackControlsModule();
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("playback-controls");
    expect(module.name).toBe("Playback Controls");
  });

  it("should be enabled by default", () => {
    expect(module.isEnabled()).toBe(true);
  });

  it("should toggle enabled state", () => {
    module.setEnabled(false);
    expect(module.isEnabled()).toBe(false);

    module.setEnabled(true);
    expect(module.isEnabled()).toBe(true);
  });

  it("should show the tab favicon indicator by default", () => {
    expect(module.getTabFaviconIndicatorEnabled()).toBe(true);
  });

  it("should provide popup views", () => {
    const views = module.getPopupViews(createTestModuleContext());
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("playback-controls");
  });

  it("should init and destroy without errors", () => {
    expect(() => module.init()).not.toThrow();
    expect(() => module.destroy()).not.toThrow();
  });

  it("should sync tab favicon indicator state when content state is restored", async () => {
    const syncSelectedTabFaviconIndicator = vi
      .fn()
      .mockResolvedValue(undefined);
    const context = createTestModuleContext({
      ytm: { syncSelectedTabFaviconIndicator },
    });

    module.setTabFaviconIndicatorEnabled(false);
    await module.syncContentState!(context);

    expect(syncSelectedTabFaviconIndicator).toHaveBeenCalledWith(false);
  });

  it("should persist tab favicon indicator changes and resync tabs", async () => {
    const syncSelectedTabFaviconIndicator = vi
      .fn()
      .mockResolvedValue(undefined);
    const context = createTestModuleContext({
      ytm: { syncSelectedTabFaviconIndicator },
    });
    const { handlers, registry } = createModuleHandlerRegistry();
    module.registerHandlers!(registry, context);

    const getResponse = await handlers.get(
      "get-tab-favicon-indicator-enabled",
    )!({}, {});
    expect(getResponse).toEqual({ ok: true, data: true });

    const setResponse = await handlers.get(
      "set-tab-favicon-indicator-enabled",
    )!({ enabled: false }, {});

    expect(setResponse).toEqual({ ok: true });
    expect(module.getTabFaviconIndicatorEnabled()).toBe(false);
    expect(context.state.saveValue).toHaveBeenCalledWith(
      "playback-controls.tabFaviconIndicatorEnabled",
      false,
    );
    expect(syncSelectedTabFaviconIndicator).toHaveBeenCalledWith(false);
  });

  it("should resync tab favicon indicators when YTM tab selection changes", () => {
    const syncSelectedTabFaviconIndicator = vi.fn();
    const context = createTestModuleContext({
      ytm: { syncSelectedTabFaviconIndicator },
    });

    module.init(context);
    context.events.emit("ytm-tabs-changed", undefined);

    expect(syncSelectedTabFaviconIndicator).toHaveBeenCalledWith(true);

    module.destroy();
    syncSelectedTabFaviconIndicator.mockClear();
    context.events.emit("ytm-tabs-changed", undefined);

    expect(syncSelectedTabFaviconIndicator).not.toHaveBeenCalled();
  });

  it("should register playback command hotkeys through the module registry", async () => {
    const executePlaybackAction = vi.fn().mockResolvedValue(undefined);
    const focusTab = vi.fn().mockResolvedValue(undefined);
    const getPlaybackState = vi.fn().mockResolvedValue({
      title: "Track A",
      artist: "Artist A",
      album: null,
      year: null,
      artworkUrl: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
    });
    const context = createTestModuleContext({
      ytm: { executePlaybackAction, focusTab, getPlaybackState },
    });
    const registry: TestHotkeyRegistry = { register: vi.fn() };

    (module as TestHotkeyModule).registerHotkeys?.(registry, context);

    const handlers = new Map<string, (command: string) => Promise<void>>(
      registry.register.mock.calls.map(([command, handler]) => [
        command as string,
        handler as (command: string) => Promise<void>,
      ]),
    );

    expect([...handlers.keys()]).toEqual([
      "play-pause",
      "next-track",
      "previous-track",
      "focus-ytm-tab",
    ]);

    await handlers.get("play-pause")?.("play-pause");
    await handlers.get("next-track")?.("next-track");
    await handlers.get("previous-track")?.("previous-track");
    await handlers.get("focus-ytm-tab")?.("focus-ytm-tab");

    expect(executePlaybackAction).toHaveBeenNthCalledWith(1, "togglePlay");
    expect(executePlaybackAction).toHaveBeenNthCalledWith(2, "next");
    expect(executePlaybackAction).toHaveBeenNthCalledWith(3, "previous");
    expect(focusTab).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(getPlaybackState).toHaveBeenCalledTimes(3);
    });
  });

  it("should emit refreshed playback state for playback command hotkeys", async () => {
    vi.useFakeTimers();

    try {
      const playbackState = {
        title: "Track A",
        artist: "Artist A",
        album: null,
        year: null,
        artworkUrl: null,
        isPlaying: true,
        progress: 12,
        duration: 200,
      };
      const executePlaybackAction = vi.fn().mockResolvedValue(undefined);
      const getPlaybackState = vi.fn().mockResolvedValue(playbackState);
      const context = createTestModuleContext({
        ytm: { executePlaybackAction, getPlaybackState },
      });
      const playbackStateListener = vi.fn();
      const registry: TestHotkeyRegistry = { register: vi.fn() };

      context.events.on("playback-state-changed", playbackStateListener);
      (module as TestHotkeyModule).registerHotkeys?.(registry, context);

      const playPauseHandler = registry.register.mock.calls.find(
        ([command]) => command === "play-pause",
      )?.[1] as ((command: string) => Promise<void>) | undefined;

      await playPauseHandler?.("play-pause");
      await vi.advanceTimersByTimeAsync(0);

      expect(executePlaybackAction).toHaveBeenCalledWith("togglePlay");
      expect(playbackStateListener).toHaveBeenCalledWith(playbackState);
    } finally {
      vi.useRealTimers();
    }
  });
});

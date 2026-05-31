import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestModuleContext } from "../../helpers/module-context";
import { PlaybackControlsModule } from "@/modules/playback-controls";
import type { ModuleContext } from "@/core/types";

interface TestHotkeyRegistry {
  register: ReturnType<typeof vi.fn>;
}

interface TestHotkeyModule {
  registerHotkeys?(registry: TestHotkeyRegistry, context: ModuleContext): void;
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

  it("should provide popup views", () => {
    const views = module.getPopupViews(createTestModuleContext());
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("playback-controls");
  });

  it("should init and destroy without errors", () => {
    expect(() => module.init()).not.toThrow();
    expect(() => module.destroy()).not.toThrow();
  });

  it("should register playback command hotkeys through the module registry", async () => {
    const executePlaybackAction = vi.fn().mockResolvedValue(undefined);
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
      ytm: { executePlaybackAction, getPlaybackState },
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
    ]);

    await handlers.get("play-pause")?.("play-pause");
    await handlers.get("next-track")?.("next-track");
    await handlers.get("previous-track")?.("previous-track");

    expect(executePlaybackAction).toHaveBeenNthCalledWith(1, "togglePlay");
    expect(executePlaybackAction).toHaveBeenNthCalledWith(2, "next");
    expect(executePlaybackAction).toHaveBeenNthCalledWith(3, "previous");
    await vi.waitFor(() => {
      expect(getPlaybackState).toHaveBeenCalledTimes(3);
    });
  });
});

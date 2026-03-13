import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlaybackControlsModule } from "@/modules/playback-controls";

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
    const views = module.getPopupViews();
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("playback-controls");
  });

  it("should init and destroy without errors", () => {
    expect(() => module.init()).not.toThrow();
    expect(() => module.destroy()).not.toThrow();
  });
});

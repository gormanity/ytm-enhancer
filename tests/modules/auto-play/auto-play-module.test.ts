import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoPlayModule } from "@/modules/auto-play";

describe("AutoPlayModule", () => {
  let module: AutoPlayModule;

  beforeEach(() => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    module = new AutoPlayModule();
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("auto-play");
    expect(module.name).toBe("Auto-Play");
  });

  it("should be disabled by default", () => {
    expect(module.isEnabled()).toBe(false);
    expect(module.getMode()).toBe("default");
  });

  it("should toggle enabled state", () => {
    module.setEnabled(true);
    expect(module.isEnabled()).toBe(true);
    expect(module.getMode()).toBe("on");

    module.setEnabled(false);
    expect(module.isEnabled()).toBe(false);
    expect(module.getMode()).toBe("off");
  });

  it("should set mode", () => {
    module.setMode("on");
    expect(module.isEnabled()).toBe(true);

    module.setMode("default");
    expect(module.isEnabled()).toBe(false);
  });

  it("should provide popup views", () => {
    const views = module.getPopupViews();

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("auto-play-settings");
  });
});

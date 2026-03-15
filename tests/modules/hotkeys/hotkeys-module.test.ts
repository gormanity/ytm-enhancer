import { describe, it, expect, vi, beforeEach } from "vitest";
import { HotkeysModule } from "@/modules/hotkeys";

describe("HotkeysModule", () => {
  let module: HotkeysModule;

  beforeEach(() => {
    vi.stubGlobal("chrome", {
      commands: {
        onCommand: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    });

    module = new HotkeysModule();
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("hotkeys");
    expect(module.name).toBe("Hotkeys");
  });

  it("should be enabled by default", () => {
    expect(module.isEnabled()).toBe(true);
  });

  it("should provide popup views", () => {
    const views = module.getPopupViews();

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("hotkeys-settings");
  });
});

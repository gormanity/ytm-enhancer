import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoSkipDislikedModule } from "@/modules/auto-skip-disliked";

describe("AutoSkipDislikedModule", () => {
  let module: AutoSkipDislikedModule;

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

    module = new AutoSkipDislikedModule();
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("auto-skip-disliked");
    expect(module.name).toBe("Auto-Skip Disliked");
  });

  it("should be disabled by default", () => {
    expect(module.isEnabled()).toBe(false);
  });

  it("should toggle enabled state", () => {
    module.setEnabled(true);
    expect(module.isEnabled()).toBe(true);

    module.setEnabled(false);
    expect(module.isEnabled()).toBe(false);
  });

  it("should provide popup views", () => {
    const views = module.getPopupViews();

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("auto-skip-disliked-settings");
  });
});

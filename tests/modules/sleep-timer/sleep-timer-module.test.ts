import { describe, it, expect, vi, beforeEach } from "vitest";
import { SleepTimerModule } from "@/modules/sleep-timer";

describe("SleepTimerModule", () => {
  let module: SleepTimerModule;

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

    module = new SleepTimerModule();
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("sleep-timer");
    expect(module.name).toBe("Sleep Timer");
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
    expect(views[0].id).toBe("sleep-timer-settings");
  });
});

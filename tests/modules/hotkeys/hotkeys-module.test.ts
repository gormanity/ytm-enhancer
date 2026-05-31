import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestModuleContext } from "../../helpers/module-context";
import { HotkeysModule } from "@/modules/hotkeys";
import type { ModuleContext } from "@/core/types";

interface TestHotkeyRegistry {
  register: ReturnType<typeof vi.fn>;
}

interface TestHotkeyModule {
  registerHotkeys?(registry: TestHotkeyRegistry, context: ModuleContext): void;
}

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
    const views = module.getPopupViews(createTestModuleContext());

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("hotkeys-settings");
  });

  it("should register the focus-tab command through the module registry", async () => {
    const focusTab = vi.fn().mockResolvedValue(undefined);
    const context = createTestModuleContext({ ytm: { focusTab } });
    const registry: TestHotkeyRegistry = { register: vi.fn() };

    (module as TestHotkeyModule).registerHotkeys?.(registry, context);

    expect(registry.register).toHaveBeenCalledWith(
      "focus-ytm-tab",
      expect.any(Function),
    );

    const handler = registry.register.mock.calls[0]?.[1] as
      | (() => Promise<void>)
      | undefined;
    await handler?.();

    expect(focusTab).toHaveBeenCalled();
  });
});

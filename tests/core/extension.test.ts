import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExtensionContext, initializeModules } from "@/core/extension";
import type { FeatureModule, PopupView } from "@/core/types";

function createMockModule(
  id: string,
  options?: { enabled?: boolean; views?: PopupView[] },
): FeatureModule {
  const enabled = options?.enabled ?? true;
  const views = options?.views ?? [];

  return {
    id,
    name: `Module ${id}`,
    description: `Test module ${id}`,
    init: vi.fn(),
    destroy: vi.fn(),
    isEnabled: vi.fn(() => enabled),
    setEnabled: vi.fn(),
    getPopupViews: vi.fn(() => views),
  };
}

describe("createExtensionContext", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", undefined);
  });

  it("should create a context with all core systems", () => {
    const ctx = createExtensionContext();

    expect(ctx.modules).toBeDefined();
    expect(ctx.events).toBeDefined();
    expect(ctx.popup).toBeDefined();
    expect(ctx.capabilities).toBeDefined();
  });
});

describe("initializeModules", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", undefined);
  });

  it("should register all modules in the registry", async () => {
    const ctx = createExtensionContext();
    const moduleA = createMockModule("a");
    const moduleB = createMockModule("b");

    await initializeModules(ctx, [moduleA, moduleB]);

    expect(ctx.modules.has("a")).toBe(true);
    expect(ctx.modules.has("b")).toBe(true);
  });

  it("should initialize enabled modules", async () => {
    const ctx = createExtensionContext();
    const module = createMockModule("test", { enabled: true });

    await initializeModules(ctx, [module]);

    expect(module.init).toHaveBeenCalled();
  });

  it("should not initialize disabled modules", async () => {
    const ctx = createExtensionContext();
    const module = createMockModule("test", { enabled: false });

    await initializeModules(ctx, [module]);

    expect(module.init).not.toHaveBeenCalled();
  });

  it("should register popup views from modules", async () => {
    const ctx = createExtensionContext();
    const view: PopupView = {
      id: "test-view",
      label: "Test",
      render: vi.fn(),
    };
    const module = createMockModule("test", { views: [view] });

    await initializeModules(ctx, [module]);

    expect(ctx.popup.get("test-view")).toBe(view);
  });

  it("should register modules even if they have no popup views", async () => {
    const ctx = createExtensionContext();
    const module = createMockModule("test");

    await initializeModules(ctx, [module]);

    expect(ctx.modules.has("test")).toBe(true);
    expect(ctx.popup.getAll()).toHaveLength(0);
  });
});

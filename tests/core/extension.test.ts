import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createExtensionContext,
  initializeModules,
  registerModuleHandlers,
  registerModuleHotkeys,
  registerModuleAlarms,
} from "@/core/extension";
import type { FeatureModule, PopupView, ModuleContext } from "@/core/types";
import type { YtmRuntimeClient } from "@/core/ytm-client";

function createMockYtmClient(): YtmRuntimeClient {
  return {
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
  };
}

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
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });

    expect(ctx.modules).toBeDefined();
    expect(ctx.events).toBeDefined();
    expect(ctx.popup).toBeDefined();
    expect(ctx.capabilities).toBeDefined();
    expect(ctx.ytm).toBeDefined();
  });
});

describe("registerModuleHandlers", () => {
  it("should register handlers owned by modules", async () => {
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });
    const registry = { on: vi.fn() };
    const module = {
      ...createMockModule("test"),
      registerHandlers: vi.fn(),
    };

    registerModuleHandlers(ctx, [module], registry);

    expect(module.registerHandlers).toHaveBeenCalledWith(registry, ctx);
  });
});

describe("registerModuleHotkeys", () => {
  it("should register hotkeys owned by modules", async () => {
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });
    const registry = { register: vi.fn() };
    const module = {
      ...createMockModule("test"),
      registerHotkeys: vi.fn(),
    };

    registerModuleHotkeys(ctx, [module], registry);

    expect(module.registerHotkeys).toHaveBeenCalledWith(registry, ctx);
  });
});

describe("registerModuleAlarms", () => {
  it("should register alarm handlers owned by modules", async () => {
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });
    const registry = { register: vi.fn() };
    const module = {
      ...createMockModule("test"),
      registerAlarms: vi.fn(),
    };

    registerModuleAlarms(ctx, [module], registry);

    expect(module.registerAlarms).toHaveBeenCalledWith(registry, ctx);
  });
});

describe("initializeModules", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", undefined);
  });

  it("should register all modules in the registry", async () => {
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });
    const moduleA = createMockModule("a");
    const moduleB = createMockModule("b");

    await initializeModules(ctx, [moduleA, moduleB]);

    expect(ctx.modules.has("a")).toBe(true);
    expect(ctx.modules.has("b")).toBe(true);
  });

  it("should initialize enabled modules", async () => {
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });
    const module = createMockModule("test", { enabled: true });

    await initializeModules(ctx, [module]);

    expect(module.init).toHaveBeenCalledWith(ctx satisfies ModuleContext);
  });

  it("should not initialize disabled modules", async () => {
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });
    const module = createMockModule("test", { enabled: false });

    await initializeModules(ctx, [module]);

    expect(module.init).not.toHaveBeenCalled();
  });

  it("should register popup views from modules", async () => {
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });
    const view: PopupView = {
      id: "test-view",
      label: "Test",
      render: vi.fn(),
    };
    const module = createMockModule("test", { views: [view] });

    await initializeModules(ctx, [module]);

    expect(module.getPopupViews).toHaveBeenCalledWith(
      ctx satisfies ModuleContext,
    );
    expect(ctx.popup.get("test-view")).toBe(view);
  });

  it("should register modules even if they have no popup views", async () => {
    const ctx = createExtensionContext({ ytm: createMockYtmClient() });
    const module = createMockModule("test");

    await initializeModules(ctx, [module]);

    expect(ctx.modules.has("test")).toBe(true);
    expect(ctx.popup.getAll()).toHaveLength(0);
  });
});

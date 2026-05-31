import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestModuleContext } from "../../helpers/module-context";
import { SleepTimerModule } from "@/modules/sleep-timer";
import { createExtensionContext } from "@/core/extension";
import type { YtmRuntimeClient } from "@/core/ytm-client";
import type { MessageResponse, ModuleHandlerRegistry } from "@/core/messaging";

function createYtmClient(): YtmRuntimeClient {
  return {
    listTabs: vi.fn(),
    selectTab: vi.fn(),
    focusTab: vi.fn(),
    getTabArtwork: vi.fn(),
    getPlaybackState: vi.fn(),
    executePlaybackAction: vi.fn().mockResolvedValue(undefined),
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
      alarms: {
        create: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(true),
      },
      notifications: {
        create: vi.fn().mockResolvedValue("sleep-timer"),
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
    const views = module.getPopupViews(createTestModuleContext());

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("sleep-timer-settings");
  });

  it("should register timer handlers and persist starts", async () => {
    const state = { saveValue: vi.fn().mockResolvedValue(undefined) };
    const alarms = {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
    };
    const context = createExtensionContext({
      ytm: createYtmClient(),
      state,
      alarms,
    });
    module.init(context);
    const handlers = new Map<
      string,
      Parameters<ModuleHandlerRegistry["on"]>[1]
    >();

    module.registerHandlers?.(
      { on: (type, handler) => handlers.set(type, handler) },
      context,
    );

    await handlers.get("start-sleep-timer")?.(
      { type: "start-sleep-timer", durationMs: 1000 },
      {},
    );
    const stateResponse = (await handlers.get("get-sleep-timer-state")?.(
      { type: "get-sleep-timer-state" },
      {},
    )) as MessageResponse;

    expect(alarms.create).toHaveBeenCalledWith(
      "sleep-timer",
      expect.objectContaining({ when: expect.any(Number) }),
    );
    expect(chrome.alarms.create).not.toHaveBeenCalled();
    expect(state.saveValue).toHaveBeenCalledWith(
      "sleep-timer.endAt",
      expect.any(Number),
    );
    expect(
      stateResponse.ok && (stateResponse.data as { active: boolean }).active,
    ).toBe(true);
  });

  it("should register its alarm handler with the module alarm registry", async () => {
    const ytm = createYtmClient();
    const context = createExtensionContext({ ytm });
    module.init(context);
    const registry = { register: vi.fn() };

    module.registerAlarms?.(registry, context);

    expect(registry.register).toHaveBeenCalledWith(
      "sleep-timer",
      expect.any(Function),
    );

    const handler = registry.register.mock.calls[0]?.[1] as (alarm: {
      name: string;
    }) => Promise<void>;
    await handler({ name: "sleep-timer" });

    expect(ytm.executePlaybackAction).toHaveBeenCalledWith("pause");
  });
});

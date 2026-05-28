import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestModuleContext } from "../../helpers/module-context";
import { AutoPlayModule } from "@/modules/auto-play";
import type {
  Message,
  MessageResponse,
  ModuleHandlerRegistry,
} from "@/core/messaging";
import type { ModuleContext } from "@/core/types";

type RegisteredHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender,
) => Promise<MessageResponse>;

function registerHandlers(
  module: AutoPlayModule,
  context: ModuleContext,
): Map<string, RegisteredHandler> {
  const handlers = new Map<string, RegisteredHandler>();
  const registry: ModuleHandlerRegistry = {
    on: (type, handler) => {
      handlers.set(type, handler);
    },
  };
  module.registerHandlers?.(registry, context);
  return handlers;
}

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
    const views = module.getPopupViews(createTestModuleContext());

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("auto-play-settings");
  });

  it("should report autoplay policy status for the selected tab", async () => {
    const context = createTestModuleContext({
      ytm: {
        listTabs: vi.fn().mockResolvedValue({ tabs: [], selectedTabId: 42 }),
      },
    });
    const handlers = registerHandlers(module, context);

    await handlers.get("set-auto-play-policy-blocked")!(
      { type: "set-auto-play-policy-blocked", blocked: true },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
    );

    const response = await handlers.get("get-auto-play-status")!(
      { type: "get-auto-play-status" },
      {} as chrome.runtime.MessageSender,
    );

    expect(response).toEqual({
      ok: true,
      data: { browserAutoplayBlocked: true },
    });
  });

  it("should ignore autoplay policy status from non-selected tabs", async () => {
    const context = createTestModuleContext({
      ytm: {
        listTabs: vi.fn().mockResolvedValue({ tabs: [], selectedTabId: 7 }),
      },
    });
    const handlers = registerHandlers(module, context);

    await handlers.get("set-auto-play-policy-blocked")!(
      { type: "set-auto-play-policy-blocked", blocked: true },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
    );

    const response = await handlers.get("get-auto-play-status")!(
      { type: "get-auto-play-status" },
      {} as chrome.runtime.MessageSender,
    );

    expect(response).toEqual({
      ok: true,
      data: { browserAutoplayBlocked: false },
    });
  });

  it("should broadcast status changes when autoplay policy state changes", async () => {
    const context = createTestModuleContext();
    const handlers = registerHandlers(module, context);

    await handlers.get("set-auto-play-policy-blocked")!(
      { type: "set-auto-play-policy-blocked", blocked: true },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
    );
    await handlers.get("set-auto-play-policy-blocked")!(
      { type: "set-auto-play-policy-blocked", blocked: true },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
    );

    expect(context.popupEvents.broadcast).toHaveBeenCalledTimes(1);
    expect(context.popupEvents.broadcast).toHaveBeenCalledWith({
      type: "auto-play-status-changed",
    });
  });
});

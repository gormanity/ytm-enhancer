import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestModuleContext } from "../../helpers/module-context";
import { MiniPlayerModule } from "@/modules/mini-player";
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
  module: MiniPlayerModule,
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

describe("MiniPlayerModule", () => {
  let module: MiniPlayerModule;

  beforeEach(() => {
    module = new MiniPlayerModule();
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("mini-player");
    expect(module.name).toBe("Mini Player");
    expect(module.description).toBeDefined();
  });

  it("should be enabled by default", () => {
    expect(module.isEnabled()).toBe(true);
  });

  it("should allow toggling enabled state", () => {
    module.setEnabled(false);
    expect(module.isEnabled()).toBe(false);
    module.setEnabled(true);
    expect(module.isEnabled()).toBe(true);
  });

  it("should disable suppress notifications by default", () => {
    expect(module.isSuppressNotificationsWhilePipOpenEnabled()).toBe(false);
  });

  it("should allow toggling suppress notifications state", () => {
    module.setSuppressNotificationsWhilePipOpen(true);
    expect(module.isSuppressNotificationsWhilePipOpenEnabled()).toBe(true);
    module.setSuppressNotificationsWhilePipOpen(false);
    expect(module.isSuppressNotificationsWhilePipOpenEnabled()).toBe(false);
  });

  it("should provide popup views", () => {
    const views = module.getPopupViews(createTestModuleContext());
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("mini-player-settings");
  });

  it("should have no-op init and destroy", () => {
    expect(() => module.init()).not.toThrow();
    expect(() => module.destroy()).not.toThrow();
  });

  it("should track open PiP windows from content runtime reports", async () => {
    const context = createTestModuleContext();
    const handlers = registerHandlers(module, context);

    await handlers.get("pip-open-state")!(
      { type: "pip-open-state", open: true },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
    );

    expect(module.hasOpenPipWindow()).toBe(true);

    await handlers.get("pip-open-state")!(
      { type: "pip-open-state", open: false },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
    );

    expect(module.hasOpenPipWindow()).toBe(false);
  });

  it("should reject PiP state reports without a sender tab", async () => {
    const context = createTestModuleContext();
    const handlers = registerHandlers(module, context);

    const response = await handlers.get("pip-open-state")!(
      { type: "pip-open-state", open: true },
      {} as chrome.runtime.MessageSender,
    );

    expect(response).toEqual({ ok: false, error: "No tab ID" });
    expect(module.hasOpenPipWindow()).toBe(false);
  });

  it("should clear open PiP state when a YTM tab resets", async () => {
    const context = createTestModuleContext();
    const handlers = registerHandlers(module, context);

    await handlers.get("pip-open-state")!(
      { type: "pip-open-state", open: true },
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
    );
    context.events.emit("ytm-tab-reset", { tabId: 42 });

    expect(module.hasOpenPipWindow()).toBe(false);
  });

  it("should register PiP lifecycle events only once", async () => {
    const context = createTestModuleContext();
    const eventsOn = vi.spyOn(context.events, "on");

    registerHandlers(module, context);
    registerHandlers(module, context);

    expect(eventsOn).toHaveBeenCalledTimes(1);
  });
});

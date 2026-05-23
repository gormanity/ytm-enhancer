import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPopupModuleContext,
  createPopupYtmRuntimeClient,
} from "@/core/popup-context";
import type { RuntimeClient } from "@/core/messaging";

describe("createPopupYtmRuntimeClient", () => {
  it("proxies YTM tab selection through runtime messages", async () => {
    const runtime: RuntimeClient = {
      request: vi.fn().mockResolvedValue({
        tabs: [],
        selectedTabId: null,
      }),
      command: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
    };
    const ytm = createPopupYtmRuntimeClient(runtime);

    await expect(ytm.listTabs()).resolves.toEqual({
      tabs: [],
      selectedTabId: null,
    });
    await ytm.selectTab(42);

    expect(runtime.request).toHaveBeenCalledWith({ type: "get-ytm-tabs" });
    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-selected-tab",
      tabId: 42,
    });
  });
});

describe("createPopupModuleContext", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ saved: true }),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it("creates popup-safe runtime, YTM, and storage clients", async () => {
    const context = createPopupModuleContext();

    expect(context.runtime).toBeDefined();
    expect(context.ytm).toBeDefined();
    await expect(context.storage.get(["saved"])).resolves.toEqual({
      saved: true,
    });
  });
});

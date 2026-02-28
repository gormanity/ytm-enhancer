import { describe, it, expect, vi, beforeEach } from "vitest";
import { HotkeysModule } from "@/modules/hotkeys";
import type { MessageSender } from "@/core/actions";
import type { MessageResponse } from "@/core/messaging";

describe("HotkeysModule", () => {
  let sendMock: ReturnType<typeof vi.fn<MessageSender>>;
  let module: HotkeysModule;

  beforeEach(() => {
    sendMock = vi.fn<MessageSender>();

    vi.stubGlobal("chrome", {
      commands: {
        onCommand: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        query: vi.fn(),
        update: vi.fn(),
      },
      windows: {
        update: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    module = new HotkeysModule(sendMock);
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("hotkeys");
    expect(module.name).toBe("Hotkeys");
  });

  it("should be enabled by default", () => {
    expect(module.isEnabled()).toBe(true);
  });

  it("should dispatch togglePlay for play-pause command", async () => {
    sendMock.mockResolvedValue({ ok: true } as MessageResponse);
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);

    await module.handleCommand("play-pause");

    expect(sendMock).toHaveBeenCalledWith(
      { type: "playback-action", action: "togglePlay" },
      { tabId: 42 },
    );
  });

  it("should dispatch next for next-track command", async () => {
    sendMock.mockResolvedValue({ ok: true } as MessageResponse);
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);

    await module.handleCommand("next-track");

    expect(sendMock).toHaveBeenCalledWith(
      { type: "playback-action", action: "next" },
      { tabId: 42 },
    );
  });

  it("should dispatch previous for previous-track command", async () => {
    sendMock.mockResolvedValue({ ok: true } as MessageResponse);
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);

    await module.handleCommand("previous-track");

    expect(sendMock).toHaveBeenCalledWith(
      { type: "playback-action", action: "previous" },
      { tabId: 42 },
    );
  });

  it("should not dispatch if no YTM tab is found", async () => {
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([]);

    await module.handleCommand("play-pause");

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should ignore unknown commands", async () => {
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);

    await module.handleCommand("unknown-command");

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should focus YTM tab for focus-ytm-tab command", async () => {
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42, windowId: 7 } as chrome.tabs.Tab]);

    await module.handleCommand("focus-ytm-tab");

    expect(sendMock).not.toHaveBeenCalled();
    expect(chrome.tabs.update).toHaveBeenCalledWith(42, { active: true });
    expect(chrome.windows.update).toHaveBeenCalledWith(7, { focused: true });
  });

  it("should not focus if no YTM tab is found for focus-ytm-tab", async () => {
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([]);

    await module.handleCommand("focus-ytm-tab");

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.windows.update).not.toHaveBeenCalled();
  });

  it("should provide popup views", () => {
    const views = module.getPopupViews();

    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("hotkeys-settings");
  });
});

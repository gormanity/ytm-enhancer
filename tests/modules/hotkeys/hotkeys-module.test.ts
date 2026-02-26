import { describe, it, expect, vi, beforeEach } from "vitest";
import { HotkeysModule } from "@/modules/hotkeys";
import type { MessageSender } from "@/core/actions";
import type { MessageResponse } from "@/core/messaging";

describe("HotkeysModule", () => {
  let sendMock: ReturnType<typeof vi.fn<MessageSender>>;
  let module: HotkeysModule;
  let commandListeners: Array<(command: string) => void>;

  beforeEach(() => {
    commandListeners = [];
    sendMock = vi.fn<MessageSender>();

    vi.stubGlobal("chrome", {
      commands: {
        onCommand: {
          addListener: vi.fn((cb: (command: string) => void) => {
            commandListeners.push(cb);
          }),
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

  it("should register a command listener on init", async () => {
    await module.init();

    expect(chrome.commands.onCommand.addListener).toHaveBeenCalled();
  });

  it("should dispatch togglePlay when play-pause command fires", async () => {
    sendMock.mockResolvedValue({ ok: true } as MessageResponse);
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);

    await module.init();
    commandListeners[0]("play-pause");

    await vi.waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(
        { type: "playback-action", action: "togglePlay" },
        { tabId: 42 },
      );
    });
  });

  it("should dispatch next when next-track command fires", async () => {
    sendMock.mockResolvedValue({ ok: true } as MessageResponse);
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);

    await module.init();
    commandListeners[0]("next-track");

    await vi.waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(
        { type: "playback-action", action: "next" },
        { tabId: 42 },
      );
    });
  });

  it("should dispatch previous when previous-track command fires", async () => {
    sendMock.mockResolvedValue({ ok: true } as MessageResponse);
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);

    await module.init();
    commandListeners[0]("previous-track");

    await vi.waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(
        { type: "playback-action", action: "previous" },
        { tabId: 42 },
      );
    });
  });

  it("should not dispatch if no YTM tab is found", async () => {
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([]);

    await module.init();
    await commandListeners[0]("play-pause");

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should ignore unknown commands", async () => {
    vi.mocked(
      chrome.tabs.query as () => Promise<chrome.tabs.Tab[]>,
    ).mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);

    await module.init();
    await commandListeners[0]("unknown-command");

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should remove the command listener on destroy", async () => {
    await module.init();
    module.destroy();

    expect(chrome.commands.onCommand.removeListener).toHaveBeenCalled();
  });
});

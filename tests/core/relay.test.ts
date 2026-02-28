import { describe, it, expect, vi, beforeEach } from "vitest";
import { relayToYTMTab } from "@/core/relay";

type TabQuery = (
  queryInfo: chrome.tabs.QueryInfo,
) => Promise<chrome.tabs.Tab[]>;

type TabSendMessage = (
  tabId: number,
  message: unknown,
) => Promise<unknown>;

describe("relayToYTMTab", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(),
        sendMessage: vi.fn(),
      },
    });
  });

  it("should send the message to the first YTM tab", async () => {
    const mockTab = { id: 42, url: "https://music.youtube.com/" };
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([
      mockTab,
    ] as chrome.tabs.Tab[]);
    vi.mocked(chrome.tabs.sendMessage as TabSendMessage).mockResolvedValue({
      ok: true,
    });

    await relayToYTMTab({ type: "set-audio-visualizer-style", style: "bars" });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
      type: "set-audio-visualizer-style",
      style: "bars",
    });
  });

  it("should not throw when no YTM tab is found", async () => {
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([]);

    await expect(
      relayToYTMTab({ type: "set-audio-visualizer-enabled", enabled: true }),
    ).resolves.toBeUndefined();

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("should not throw when tab has no id", async () => {
    const mockTab = { url: "https://music.youtube.com/" };
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([
      mockTab,
    ] as chrome.tabs.Tab[]);

    await expect(
      relayToYTMTab({ type: "set-audio-visualizer-enabled", enabled: true }),
    ).resolves.toBeUndefined();

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createYtmRuntimeClient,
  type YtmRuntimeClientOptions,
} from "@/core/ytm-client";
import type { MessageResponse } from "@/core/messaging";

const CONNECTION_ERROR =
  "Could not establish connection. Receiving end does not exist.";

type TabQuery = (
  queryInfo: chrome.tabs.QueryInfo,
) => Promise<chrome.tabs.Tab[]>;

type TabSendMessage = (
  tabId: number,
  message: unknown,
) => Promise<MessageResponse>;

function createClient(options: Partial<YtmRuntimeClientOptions> = {}) {
  let selectedTabId = options.getSelectedTabId?.() ?? null;
  const setSelectedTabId = vi.fn(async (tabId: number | null) => {
    selectedTabId = tabId;
  });
  return {
    client: createYtmRuntimeClient({
      getSelectedTabId: () => selectedTabId,
      setSelectedTabId,
      isTabSuppressed: () => false,
      ...options,
    }),
    setSelectedTabId,
  };
}

describe("YtmRuntimeClient", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(),
        sendMessage: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
      windows: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("lists tabs and resolves the selected tab against open YTM tabs", async () => {
    const { client, setSelectedTabId } = createClient({
      getSelectedTabId: () => 999,
    });
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([
      { id: 1, title: "Inactive - YouTube Music", active: false },
      { id: 2, title: "Active - YouTube Music", active: true },
    ] as chrome.tabs.Tab[]);

    const state = await client.listTabs();

    expect(state).toEqual({
      selectedTabId: 2,
      tabs: [
        {
          id: 1,
          title: "Inactive - YouTube Music",
          artworkUrl: null,
          isSelected: false,
        },
        {
          id: 2,
          title: "Active - YouTube Music",
          artworkUrl: null,
          isSelected: true,
        },
      ],
    });
    expect(setSelectedTabId).toHaveBeenCalledWith(2);
  });

  it("uses the first available YTM tab for any-target actions", async () => {
    const { client } = createClient();
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([
      { id: 7, title: "YouTube Music" },
    ] as chrome.tabs.Tab[]);
    vi.mocked(chrome.tabs.sendMessage as TabSendMessage).mockResolvedValue({
      ok: true,
    });

    await client.executePlaybackAction("next", { kind: "any" });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: "playback-action",
      action: "next",
    });
  });

  it("returns the existing disabled error when the target tab is suppressed", async () => {
    const { client } = createClient({
      getSelectedTabId: () => 5,
      isTabSuppressed: (tabId) => tabId === 5,
    });
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([
      { id: 5, title: "YouTube Music" },
    ] as chrome.tabs.Tab[]);

    await expect(client.getPlaybackState()).rejects.toThrow(
      "Disabled while the dev build is active",
    );
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("throws No YTM tab when no target tab is available", async () => {
    const { client } = createClient();
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([]);

    await expect(client.getPlaybackState()).rejects.toThrow("No YTM tab");
  });

  it("injects the content script and retries when a tab has no receiver", async () => {
    const { client } = createClient({ getSelectedTabId: () => 3 });
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([
      { id: 3, title: "YouTube Music" },
    ] as chrome.tabs.Tab[]);
    vi.mocked(chrome.tabs.sendMessage as TabSendMessage)
      .mockRejectedValueOnce(new Error(CONNECTION_ERROR))
      .mockResolvedValueOnce({ ok: true });

    await client.executePlaybackAction("play");

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 3 },
      files: ["content.js"],
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("selects and focuses YTM tabs through the tab APIs", async () => {
    const { client, setSelectedTabId } = createClient();
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([
      { id: 4, title: "YouTube Music", windowId: 11 },
    ] as chrome.tabs.Tab[]);

    await client.selectTab(4);
    await client.focusTab(4);

    expect(setSelectedTabId).toHaveBeenCalledWith(4);
    expect(chrome.tabs.update).toHaveBeenCalledWith(4, { active: true });
    expect(chrome.windows.update).toHaveBeenCalledWith(11, { focused: true });
  });
});

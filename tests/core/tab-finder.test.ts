import { describe, it, expect, vi, beforeEach } from "vitest";
import { findYTMTab } from "@/core/tab-finder";

type TabQuery = (
  queryInfo: chrome.tabs.QueryInfo,
) => Promise<chrome.tabs.Tab[]>;

describe("findYTMTab", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(),
      },
    });
  });

  it("should find a YouTube Music tab", async () => {
    const mockTab = { id: 42, url: "https://music.youtube.com/" };
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([
      mockTab,
    ] as chrome.tabs.Tab[]);

    const tab = await findYTMTab();

    expect(chrome.tabs.query).toHaveBeenCalledWith({
      url: "https://music.youtube.com/*",
    });
    expect(tab).toEqual(mockTab);
  });

  it("should return the first tab when multiple YTM tabs exist", async () => {
    const tabs = [
      { id: 1, url: "https://music.youtube.com/" },
      { id: 2, url: "https://music.youtube.com/watch?v=abc" },
    ];
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue(
      tabs as chrome.tabs.Tab[],
    );

    const tab = await findYTMTab();

    expect(tab?.id).toBe(1);
  });

  it("should return null when no YTM tab exists", async () => {
    vi.mocked(chrome.tabs.query as TabQuery).mockResolvedValue([]);

    const tab = await findYTMTab();

    expect(tab).toBeNull();
  });
});

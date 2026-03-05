const YTM_URL_PATTERN = "https://music.youtube.com/*";

/** Find the first open YouTube Music tab, prioritizing the selected one if provided. */
export async function findYTMTab(
  selectedTabId?: number | null,
): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: YTM_URL_PATTERN });

  if (selectedTabId != null) {
    const selected = tabs.find((t) => t.id === selectedTabId);
    if (selected) return selected;
  }

  return tabs[0] ?? null;
}

/** Find all open YouTube Music tabs. */
export async function findAllYTMTabs(): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({ url: YTM_URL_PATTERN });
}

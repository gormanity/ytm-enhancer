const YTM_URL_PATTERN = "https://music.youtube.com/*";

/** Find the first open YouTube Music tab. */
export async function findYTMTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: YTM_URL_PATTERN });
  return tabs[0] ?? null;
}

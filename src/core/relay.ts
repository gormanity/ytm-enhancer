import { findYTMTab } from "./tab-finder";

/** Relay a message to the first open YouTube Music tab. */
export async function relayToYTMTab(
  message: Record<string, unknown>,
): Promise<void> {
  const tab = await findYTMTab();
  if (tab?.id === undefined) return;
  await chrome.tabs.sendMessage(tab.id, message);
}

type RuntimeMessageListener = Parameters<
  typeof chrome.runtime.onMessage.addListener
>[0];

export function addRuntimeMessageListener(
  listener: RuntimeMessageListener,
): boolean {
  try {
    chrome.runtime.onMessage.addListener(listener);
    return true;
  } catch {
    return false;
  }
}

export function removeRuntimeMessageListener(
  listener: RuntimeMessageListener,
): void {
  try {
    chrome.runtime.onMessage.removeListener(listener);
  } catch {
    // The extension context can be invalidated before content cleanup runs.
  }
}

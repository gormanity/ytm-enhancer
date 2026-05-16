const ACTION_ICON_SIZES = [16, 48, 128] as const;

type ActionIconPath = Record<(typeof ACTION_ICON_SIZES)[number], string>;

export function getActionIconPath(disabled: boolean): ActionIconPath {
  return Object.fromEntries(
    ACTION_ICON_SIZES.map((size) => [
      size,
      disabled ? `icon${size}-disabled.png` : `icon${size}.png`,
    ]),
  ) as ActionIconPath;
}

export function updateDevBuildSuspendedTab(
  suspendedTabIds: Set<number>,
  tabId: number,
  suspended: boolean,
): boolean {
  const wasSuspended = suspendedTabIds.has(tabId);

  if (suspended) {
    suspendedTabIds.add(tabId);
  } else {
    suspendedTabIds.delete(tabId);
  }

  return suspendedTabIds.has(tabId) !== wasSuspended;
}

export function isActionSuppressedForDevBuildConflict(
  suspendedTabIds: Set<number>,
  tabId: number | undefined,
): boolean {
  return tabId !== undefined && suspendedTabIds.has(tabId);
}

export function setActionDevBuildConflictIndicator(
  disabled: boolean,
  isDevBuild: boolean,
): void {
  if (isDevBuild || typeof chrome.action !== "object") return;

  void chrome.action
    .setIcon({ path: getActionIconPath(disabled) })
    .catch(() => undefined);
  void chrome.action
    .setTitle({
      title: disabled
        ? "YTM Enhancer disabled while the dev build is active"
        : "YTM Enhancer",
    })
    .catch(() => undefined);
  void chrome.action
    .setBadgeText({
      text: disabled ? "OFF" : "",
    })
    .catch(() => undefined);
  void chrome.action
    .setBadgeBackgroundColor({
      color: "#555555",
    })
    .catch(() => undefined);
}

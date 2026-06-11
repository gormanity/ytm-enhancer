import { getActionIconPath } from "./action-icon";

export interface DevBuildConflictState {
  suspendedTabIds: Set<number>;
  externalDevBuildPresent: boolean;
}

export function isDevBuildConflictActive(
  state: DevBuildConflictState,
): boolean {
  return state.externalDevBuildPresent || state.suspendedTabIds.size > 0;
}

export function shouldForwardHotkeyToDevBuild(
  state: DevBuildConflictState,
  isDevBuild: boolean,
): boolean {
  return !isDevBuild && isDevBuildConflictActive(state);
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
  state: DevBuildConflictState,
  tabId: number | undefined,
): boolean {
  return (
    state.externalDevBuildPresent ||
    (tabId !== undefined && state.suspendedTabIds.has(tabId))
  );
}

export async function setActionDevBuildConflictIndicator(
  disabled: boolean,
  isDevBuild: boolean,
): Promise<void> {
  if (isDevBuild || typeof chrome.action !== "object") return;

  await Promise.allSettled([
    chrome.action.setIcon({
      path: getActionIconPath(disabled ? "disabled" : "idle"),
    }),
    chrome.action.setTitle({
      title: disabled
        ? "YTM Enhancer disabled while the dev build is active"
        : "YTM Enhancer",
    }),
    chrome.action.setBadgeText({
      text: disabled ? "OFF" : "",
    }),
    chrome.action.setBadgeBackgroundColor({
      color: "#555555",
    }),
  ]);
}

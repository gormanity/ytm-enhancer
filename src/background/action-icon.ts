const ACTION_ICON_SIZES = [16, 48, 128] as const;

export type ActionIconState = "idle" | "playing" | "disabled";
type ActionIconSize = (typeof ACTION_ICON_SIZES)[number];
type ActionIconPath = Record<ActionIconSize, string>;

export function getActionIconPath(state: ActionIconState): ActionIconPath {
  return Object.fromEntries(
    ACTION_ICON_SIZES.map((size) => {
      const suffix =
        state === "idle" ? "" : state === "playing" ? "-playing" : "-disabled";

      return [size, `icon${size}${suffix}.png`];
    }),
  ) as ActionIconPath;
}

export async function setActionPlaybackIndicator(
  isPlaying: boolean,
  suppressed: boolean,
): Promise<void> {
  if (suppressed || typeof chrome.action !== "object") return;

  await Promise.allSettled([
    chrome.action.setIcon({
      path: getActionIconPath(isPlaying ? "playing" : "idle"),
    }),
  ]);
}

import type { FeatureModule, PlaybackState, PopupView } from "@/core/types";
import { createNotificationsPopupView } from "./popup";

const NOTIFICATION_ID = "ytm-enhancer-now-playing";
const FALLBACK_ICON = "icon48.png";

/**
 * Upgrade a YTM thumbnail URL to a larger size for notifications.
 * YTM artwork URLs contain size params like `=w60-h60-l90-rj`.
 */
function getNotificationArtworkUrl(artworkUrl: string): string {
  return artworkUrl.replace(/=w\d+-h\d+/, "=w256-h256");
}

export class NotificationsModule implements FeatureModule {
  readonly id = "notifications";
  readonly name = "Notifications";
  readonly description = "Native browser notifications on track change";

  private enabled = true;
  private lastTrackKey: string | null = null;

  init(): void {
    // No background-side setup needed; track changes are pushed
    // from the content script via messages.
  }

  destroy(): void {
    this.lastTrackKey = null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getPopupViews(): PopupView[] {
    return [createNotificationsPopupView(this)];
  }

  handleTrackChange(state: PlaybackState): void {
    if (!this.enabled) return;
    if (!state.title || !state.artist) return;

    const trackKey = `${state.title}\0${state.artist}`;
    if (trackKey === this.lastTrackKey) return;

    if (this.lastTrackKey !== null) {
      chrome.notifications.clear(NOTIFICATION_ID, () => {});
    }

    this.lastTrackKey = trackKey;

    const iconUrl = state.artworkUrl
      ? getNotificationArtworkUrl(state.artworkUrl)
      : chrome.runtime.getURL(FALLBACK_ICON);

    chrome.notifications.create(
      NOTIFICATION_ID,
      {
        type: "basic",
        title: state.title,
        message: state.artist,
        iconUrl,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[YTM Enhancer] Notification failed:",
            chrome.runtime.lastError.message,
          );
        }
      },
    );
  }
}

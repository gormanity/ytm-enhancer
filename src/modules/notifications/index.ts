import type { FeatureModule, PlaybackState, PopupView } from "@/core/types";
import { createNotificationsPopupView } from "./popup";

const NOTIFICATION_ID_PREFIX = "ytm-enhancer-now-playing-";
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
  private notifyOnUnpause = false;
  private lastTrackKey: string | null = null;
  private lastNotificationId: string | null = null;
  private notificationCounter = 0;

  init(): void {
    // No background-side setup needed; track changes are pushed
    // from the content script via messages.
  }

  destroy(): void {
    this.lastTrackKey = null;
    this.lastNotificationId = null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isNotifyOnUnpauseEnabled(): boolean {
    return this.notifyOnUnpause;
  }

  setNotifyOnUnpause(enabled: boolean): void {
    this.notifyOnUnpause = enabled;
  }

  getPopupViews(): PopupView[] {
    return [createNotificationsPopupView()];
  }

  handleTrackChange(state: PlaybackState): void {
    if (!this.enabled) return;
    if (!state.title || !state.artist) return;

    const trackKey = `${state.title}\0${state.artist}`;

    if (trackKey === this.lastTrackKey && !this.notifyOnUnpause) return;

    this.lastTrackKey = trackKey;

    const iconUrl = state.artworkUrl
      ? getNotificationArtworkUrl(state.artworkUrl)
      : chrome.runtime.getURL(FALLBACK_ICON);

    const notificationId = `${NOTIFICATION_ID_PREFIX}${++this.notificationCounter}`;
    const options: chrome.notifications.NotificationCreateOptions = {
      type: "basic",
      title: state.title,
      message: state.artist,
      iconUrl,
    };

    const showNotification = () => {
      this.lastNotificationId = notificationId;
      chrome.notifications.create(notificationId, options, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[YTM Enhancer Notifications] create failed:",
            chrome.runtime.lastError.message,
          );
        }
      });
    };

    // macOS suppresses new banners when a notification from the same
    // app already exists in Notification Center. Clear the previous
    // one first, then create the new one in the callback.
    if (this.lastNotificationId) {
      chrome.notifications.clear(this.lastNotificationId, () => {
        showNotification();
      });
    } else {
      showNotification();
    }
  }
}

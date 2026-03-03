import type { FeatureModule, PlaybackState, PopupView } from "@/core/types";
import { createNotificationsPopupView } from "./popup";

const NOTIFICATION_ID_PREFIX = "ytm-enhancer-now-playing-";
const FALLBACK_ICON = "icon48.png";

export interface NotificationFields {
  title: boolean;
  artist: boolean;
  album: boolean;
  year: boolean;
  artwork: boolean;
}

const DEFAULT_FIELDS: NotificationFields = {
  title: true,
  artist: true,
  album: false,
  year: false,
  artwork: true,
};

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
  private fields: NotificationFields = { ...DEFAULT_FIELDS };
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

  getFields(): NotificationFields {
    return { ...this.fields };
  }

  setFields(fields: NotificationFields): void {
    this.fields = { ...fields };
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
    this.showNotification(state);
  }

  /** Trigger a test notification for preview purposes. */
  triggerPreview(): void {
    console.log("[YTM Enhancer Notifications] Triggering preview...");
    this.showNotification({
      title: "Test Track",
      artist: "Example Artist",
      album: "Demo Album",
      year: 2026,
      artworkUrl: null, // Use local fallback for preview reliability
      isPlaying: true,
      isLiked: false,
      isDisliked: false,
      progress: 0.5,
      duration: 180,
    });
  }

  private showNotification(state: PlaybackState): void {
    const notificationTitle =
      this.fields.title && state.title ? state.title : "Now Playing";

    const messageParts: string[] = [];
    if (this.fields.artist && state.artist) messageParts.push(state.artist);
    if (this.fields.album && state.album) messageParts.push(state.album);
    if (this.fields.year && state.year != null)
      messageParts.push(String(state.year));
    
    // Ensure message isn't empty, some platforms require this
    const notificationMessage = messageParts.length > 0 
      ? messageParts.join(" \u2014 ")
      : "Previewing notification settings";

    const iconUrl =
      this.fields.artwork && state.artworkUrl
        ? getNotificationArtworkUrl(state.artworkUrl)
        : chrome.runtime.getURL(FALLBACK_ICON);

    const notificationId = `${NOTIFICATION_ID_PREFIX}${++this.notificationCounter}`;
    const options: chrome.notifications.NotificationCreateOptions = {
      type: "basic",
      title: notificationTitle,
      message: notificationMessage,
      iconUrl,
    };

    const display = () => {
      this.lastNotificationId = notificationId;
      chrome.notifications.create(notificationId, options, (id) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[YTM Enhancer Notifications] create failed:",
            chrome.runtime.lastError.message,
          );
        } else {
          console.log("[YTM Enhancer Notifications] created:", id);
        }
      });
    };

    if (this.lastNotificationId) {
      chrome.notifications.clear(this.lastNotificationId, () => {
        display();
      });
    } else {
      display();
    }
  }
}

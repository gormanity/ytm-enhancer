import type {
  FeatureModule,
  ModuleContext,
  PlaybackState,
  PopupView,
} from "@/core/types";
import { createNotificationsPopupView } from "./popup";
import { debug, error } from "@/core/logger";
import type { HotkeyHandlerRegistry } from "@/core/hotkey-registry";
import type { ModuleHandlerRegistry } from "@/core/messaging";

const NOTIFICATION_ID = "ytm-enhancer-now-playing";
const FALLBACK_ICON = "icon48.png";
const PREVIEW_ARTWORK = "preview-artwork.png";

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

function isFirefoxRuntime(): boolean {
  const maybeBrowser = (globalThis as { browser?: unknown }).browser;
  return (
    typeof maybeBrowser === "object" &&
    maybeBrowser !== null &&
    typeof (maybeBrowser as { runtime?: unknown }).runtime === "object"
  );
}

export class NotificationsModule implements FeatureModule {
  readonly id = "notifications";
  readonly name = "Notifications";
  readonly description = "Native browser notifications on track change";

  private enabled = true;
  private notifyOnUnpause = false;
  private fields: NotificationFields = { ...DEFAULT_FIELDS };
  private lastTrackKey: string | null = null;
  private clickListener: ((id: string) => void) | null = null;
  private context: ModuleContext | null = null;

  init(context?: ModuleContext): void {
    this.context = context ?? null;
    const listener = (id: string): void => {
      if (id !== NOTIFICATION_ID) return;
      void this.focusYtmTab();
    };
    this.clickListener = listener;
    chrome.notifications.onClicked.addListener(listener);
  }

  destroy(): void {
    this.lastTrackKey = null;
    this.context = null;
    if (this.clickListener) {
      chrome.notifications.onClicked.removeListener(this.clickListener);
      this.clickListener = null;
    }
  }

  private async focusYtmTab(): Promise<void> {
    this.clearCurrent();
    await Promise.resolve(this.context?.ytm.focusTab()).catch(() => undefined);
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

  getPopupViews(context: ModuleContext): PopupView[] {
    return [createNotificationsPopupView(context)];
  }

  registerHandlers(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void {
    registry.on("get-notifications-enabled", async () => ({
      ok: true,
      data: this.isEnabled(),
    }));
    registry.on("set-notifications-enabled", async (message) => {
      this.setEnabled(message.enabled as boolean);
      void context.state.saveValue("notifications.enabled", message.enabled);
      return { ok: true };
    });
    registry.on("get-notify-on-unpause", async () => ({
      ok: true,
      data: this.isNotifyOnUnpauseEnabled(),
    }));
    registry.on("set-notify-on-unpause", async (message) => {
      this.setNotifyOnUnpause(message.enabled as boolean);
      void context.state.saveValue(
        "notifications.notifyOnUnpause",
        message.enabled,
      );
      return { ok: true };
    });
    registry.on("get-notification-fields", async () => ({
      ok: true,
      data: this.getFields(),
    }));
    registry.on("set-notification-fields", async (message) => {
      this.setFields(message.fields as NotificationFields);
      void context.state.saveValue("notifications.fields", message.fields);
      return { ok: true };
    });
    registry.on("preview-notification", async () => {
      this.triggerPreview();
      return { ok: true };
    });
  }

  registerHotkeys(
    registry: HotkeyHandlerRegistry,
    context: ModuleContext,
  ): void {
    registry.register("remind-me", async () => {
      try {
        const state = await context.ytm.getPlaybackState();
        this.showReminder(state);
      } catch {
        // Tab may not have the content script loaded.
      }
    });
  }

  /** Show a reminder notification unconditionally (ignores enabled/dedup). */
  showReminder(state: PlaybackState): void {
    if (!state.title || !state.artist) return;
    this.showNotification(state);
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
    debug("Notifications: triggering preview");
    this.showNotification({
      title: "Test Track",
      artist: "Example Artist",
      album: "Demo Album",
      year: 2026,
      artworkUrl: chrome.runtime.getURL(PREVIEW_ARTWORK),
      isPlaying: true,
      progress: 0.5,
      duration: 180,
    });
  }

  /** Clear the active now-playing notification if one is visible. */
  clearCurrent(): void {
    const clearResult = chrome.notifications.clear(NOTIFICATION_ID) as
      | Promise<unknown>
      | undefined;
    if (clearResult && typeof clearResult.then === "function") {
      clearResult.catch(() => {});
    }
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
    const notificationMessage =
      messageParts.length > 0
        ? messageParts.join(" \u2014 ")
        : "Previewing notification settings";

    const iconUrl =
      this.fields.artwork && state.artworkUrl
        ? getNotificationArtworkUrl(state.artworkUrl)
        : chrome.runtime.getURL(FALLBACK_ICON);

    const options: chrome.notifications.NotificationCreateOptions = {
      type: "basic",
      title: notificationTitle,
      message: notificationMessage,
      iconUrl,
    };
    if (!isFirefoxRuntime()) {
      // YTM Enhancer fires a notification on every track change, so the
      // OS chime quickly becomes noise. Suppress it where the option is
      // supported.
      options.silent = true;
    }

    // Clear then re-create after a short delay so macOS has time to
    // process the removal before the new toast arrives. Without the
    // gap, the window server throttles back-to-back notifications.
    //
    // Don't nest create() inside the clear() callback — Firefox returns a
    // Promise from clear() and does not reliably invoke a passed callback,
    // which broke notifications entirely. Fire-and-forget the clear and
    // schedule create on its own timer.
    this.clearCurrent();

    setTimeout(() => {
      const createResult = chrome.notifications.create(
        NOTIFICATION_ID,
        options,
        (id) => {
          if (chrome.runtime.lastError) {
            error(
              "Notifications: create failed:",
              chrome.runtime.lastError.message,
            );
          } else {
            debug("Notifications: created:", id);
          }
        },
      ) as Promise<string> | undefined;
      if (createResult && typeof createResult.then === "function") {
        createResult
          .then((id) => debug("Notifications: created:", id))
          .catch((e: unknown) =>
            error(
              "Notifications: create rejected:",
              e instanceof Error ? e.message : String(e),
            ),
          );
      }
    }, 150);
  }
}

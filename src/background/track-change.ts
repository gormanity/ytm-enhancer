import type { Message, MessageResponse } from "@/core/messaging";
import type { PlaybackState } from "@/core/types";

interface TrackChangeMiniPlayer {
  syncPipOpenState(tabId: number | undefined, open: unknown): void;
  isSuppressNotificationsWhilePipOpenEnabled(): boolean;
  hasOpenPipWindow(): boolean;
}

interface TrackChangeNotifications {
  clearCurrent(): void;
  handleTrackChange(state: PlaybackState): void;
}

export interface TrackChangeDependencies {
  isYTMTabSuppressed(tabId: number | undefined): boolean;
  miniPlayer: TrackChangeMiniPlayer;
  notifications: TrackChangeNotifications;
  publishPlaybackState(state: PlaybackState): void;
}

export function handleTrackChangedMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
  dependencies: TrackChangeDependencies,
): MessageResponse {
  const tabId = sender?.tab?.id;
  if (dependencies.isYTMTabSuppressed(tabId)) {
    return { ok: true };
  }

  const state = message.state as PlaybackState;
  dependencies.publishPlaybackState(state);
  dependencies.miniPlayer.syncPipOpenState(tabId, message.pipOpen);
  const messageReportsPipOpen = message.pipOpen === true;
  if (
    dependencies.miniPlayer.isSuppressNotificationsWhilePipOpenEnabled() &&
    (messageReportsPipOpen || dependencies.miniPlayer.hasOpenPipWindow())
  ) {
    dependencies.notifications.clearCurrent();
    return { ok: true };
  }

  dependencies.notifications.handleTrackChange(state);
  return { ok: true };
}

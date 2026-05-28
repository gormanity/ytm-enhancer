import type { Message, MessageResponse } from "@/core/messaging";
import type { PlaybackState } from "@/core/types";

interface TrackChangeMiniPlayer {
  syncPipOpenState(tabId: number | undefined, open: unknown): void;
  isSuppressNotificationsWhilePipOpenEnabled(): boolean;
  hasOpenPipWindow(): boolean;
}

interface TrackChangeNotifications {
  handleTrackChange(state: PlaybackState): void;
}

export interface TrackChangeDependencies {
  isYTMTabSuppressed(tabId: number | undefined): boolean;
  miniPlayer: TrackChangeMiniPlayer;
  notifications: TrackChangeNotifications;
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

  dependencies.miniPlayer.syncPipOpenState(tabId, message.pipOpen);
  if (
    dependencies.miniPlayer.isSuppressNotificationsWhilePipOpenEnabled() &&
    dependencies.miniPlayer.hasOpenPipWindow()
  ) {
    return { ok: true };
  }

  dependencies.notifications.handleTrackChange(message.state as PlaybackState);
  return { ok: true };
}

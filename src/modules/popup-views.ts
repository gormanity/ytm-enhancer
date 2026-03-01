import type { PopupView } from "@/core/types";
import { createAutoSkipDislikedPopupView } from "./auto-skip-disliked/popup";
import { createAudioVisualizerPopupView } from "./audio-visualizer/popup";
import { createHotkeysPopupView } from "./hotkeys/popup";
import { createMiniPlayerPopupView } from "./mini-player/popup";
import { createNotificationsPopupView } from "./notifications/popup";
import { createPlaybackSpeedPopupView } from "./playback-speed/popup";
import { createStreamQualityPopupView } from "./stream-quality/popup";

/**
 * All popup views provided by feature modules.
 *
 * When adding a new module with a popup view, register its
 * factory here so it appears in the extension popup.
 */
export function getAllPopupViews(): PopupView[] {
  return [
    createAutoSkipDislikedPopupView(),
    createAudioVisualizerPopupView(),
    createHotkeysPopupView(),
    createMiniPlayerPopupView(),
    createNotificationsPopupView(),
    createPlaybackSpeedPopupView(),
    createStreamQualityPopupView(),
  ];
}

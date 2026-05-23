import type { PopupView } from "@/core/types";
import { createPopupModuleContext } from "@/core/popup-context";
import { createPlaybackControlsPopupView } from "./playback-controls/popup";
import { createAutoPlayPopupView } from "./auto-play/popup";
import { createAutoSkipDislikedPopupView } from "./auto-skip-disliked/popup";
import { createAudioVisualizerPopupView } from "./audio-visualizer/popup";
import { createHotkeysPopupView } from "./hotkeys/popup";
import { createMiniPlayerPopupView } from "./mini-player/popup";
import { createNotificationsPopupView } from "./notifications/popup";
import { createSleepTimerPopupView } from "./sleep-timer/popup";
import { createAboutPopupView } from "./about/popup";
import playbackControlsIcon from "@/assets/module-icons/playback-controls.svg?raw";
import autoPlayIcon from "@/assets/module-icons/auto-play.svg?raw";
import autoSkipIcon from "@/assets/module-icons/auto-skip.svg?raw";
import visualizerIcon from "@/assets/module-icons/visualizer.svg?raw";
import hotkeysIcon from "@/assets/module-icons/hotkeys.svg?raw";
import miniPlayerIcon from "@/assets/module-icons/mini-player.svg?raw";
import notificationsIcon from "@/assets/module-icons/notifications.svg?raw";
import sleepTimerIcon from "@/assets/module-icons/sleep-timer.svg?raw";
import aboutIcon from "@/assets/module-icons/about.svg?raw";

const ICONS = {
  playbackControls: playbackControlsIcon,
  autoPlay: autoPlayIcon,
  autoSkip: autoSkipIcon,
  visualizer: visualizerIcon,
  hotkeys: hotkeysIcon,
  miniPlayer: miniPlayerIcon,
  notifications: notificationsIcon,
  sleepTimer: sleepTimerIcon,
  about: aboutIcon,
};

/**
 * All popup views provided by feature modules.
 *
 * When adding a new module with a popup view, register its
 * factory here so it appears in the extension popup.
 */
export function getAllPopupViews(): PopupView[] {
  const context = createPopupModuleContext();
  return [
    {
      ...createPlaybackControlsPopupView(context),
      icon: ICONS.playbackControls,
    },
    { ...createAutoPlayPopupView(context), icon: ICONS.autoPlay },
    { ...createAutoSkipDislikedPopupView(context), icon: ICONS.autoSkip },
    { ...createAudioVisualizerPopupView(context), icon: ICONS.visualizer },
    { ...createHotkeysPopupView(context), icon: ICONS.hotkeys },
    { ...createMiniPlayerPopupView(context), icon: ICONS.miniPlayer },
    { ...createNotificationsPopupView(context), icon: ICONS.notifications },
    { ...createSleepTimerPopupView(context), icon: ICONS.sleepTimer },
    { ...createAboutPopupView(context), icon: ICONS.about },
  ];
}

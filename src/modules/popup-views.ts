import type { PopupView } from "@/core/types";
import { createPopupModuleContext } from "@/core/popup-context";
import { createPlaybackControlsPopupView } from "./playback-controls/popup";
import { createAutomationPopupView } from "./automation/popup";
import { createAudioVisualizerPopupView } from "./audio-visualizer/popup";
import { createHotkeysPopupView } from "./hotkeys/popup";
import { createMiniPlayerPopupView } from "./mini-player/popup";
import { createNotificationsPopupView } from "./notifications/popup";
import { createSleepTimerPopupView } from "./sleep-timer/popup";
import { createConnectedAppsPopupView } from "@/core/connectors/popup";
import { createAboutPopupView } from "./about/popup";
import playbackControlsIcon from "@/assets/module-icons/playback-controls.svg?raw";
import autoPlayIcon from "@/assets/module-icons/auto-play.svg?raw";
import visualizerIcon from "@/assets/module-icons/visualizer.svg?raw";
import hotkeysIcon from "@/assets/module-icons/hotkeys.svg?raw";
import miniPlayerIcon from "@/assets/module-icons/mini-player.svg?raw";
import notificationsIcon from "@/assets/module-icons/notifications.svg?raw";
import sleepTimerIcon from "@/assets/module-icons/sleep-timer.svg?raw";
import connectedAppsIcon from "@/assets/module-icons/connected-apps.svg?raw";
import aboutIcon from "@/assets/module-icons/about.svg?raw";

const ICONS = {
  playbackControls: playbackControlsIcon,
  automation: autoPlayIcon,
  visualizer: visualizerIcon,
  hotkeys: hotkeysIcon,
  miniPlayer: miniPlayerIcon,
  notifications: notificationsIcon,
  sleepTimer: sleepTimerIcon,
  connectedApps: connectedAppsIcon,
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
    { ...createAutomationPopupView(context), icon: ICONS.automation },
    { ...createAudioVisualizerPopupView(context), icon: ICONS.visualizer },
    { ...createHotkeysPopupView(context), icon: ICONS.hotkeys },
    { ...createMiniPlayerPopupView(context), icon: ICONS.miniPlayer },
    { ...createNotificationsPopupView(context), icon: ICONS.notifications },
    { ...createSleepTimerPopupView(context), icon: ICONS.sleepTimer },
    { ...createConnectedAppsPopupView(context), icon: ICONS.connectedApps },
    { ...createAboutPopupView(context), icon: ICONS.about },
  ];
}

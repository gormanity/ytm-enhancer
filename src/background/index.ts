import {
  createExtensionContext,
  createMessageSender,
  initializeModules,
  type FeatureModule,
} from "@/core";
import type { PlaybackState } from "@/core/types";
import { HotkeysModule } from "@/modules/hotkeys";
import { NotificationsModule } from "@/modules/notifications";

const context = createExtensionContext();
const send = createMessageSender();
const hotkeys = new HotkeysModule(send);
const notifications = new NotificationsModule();

// Chrome MV3 service workers require event listeners to be registered
// synchronously at the top level of the script, during the first turn
// of the event loop. Registering inside an async init() is too late.
chrome.commands.onCommand.addListener((command: string) => {
  void hotkeys.handleCommand(command);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "track-changed") {
    notifications.handleTrackChange(message.state as PlaybackState);
  } else if (message.type === "get-notifications-enabled") {
    sendResponse({ ok: true, data: notifications.isEnabled() });
  } else if (message.type === "set-notifications-enabled") {
    notifications.setEnabled(message.enabled as boolean);
    sendResponse({ ok: true });
  }
  return true;
});

const modules: FeatureModule[] = [hotkeys, notifications];

initializeModules(context, modules).catch((err) => {
  console.error("[YTM Enhancer] Failed to initialize modules:", err);
});

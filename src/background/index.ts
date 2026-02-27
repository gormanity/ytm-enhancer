import {
  createExtensionContext,
  createMessageHandler,
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

const handler = createMessageHandler();

handler.on("track-changed", async (message) => {
  notifications.handleTrackChange(message.state as PlaybackState);
  return { ok: true };
});

handler.on("get-notifications-enabled", async () => {
  return { ok: true, data: notifications.isEnabled() };
});

handler.on("set-notifications-enabled", async (message) => {
  notifications.setEnabled(message.enabled as boolean);
  return { ok: true };
});

handler.start();

const modules: FeatureModule[] = [hotkeys, notifications];

initializeModules(context, modules).catch((err) => {
  console.error("[YTM Enhancer] Failed to initialize modules:", err);
});

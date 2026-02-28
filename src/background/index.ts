import {
  createExtensionContext,
  createMessageHandler,
  createMessageSender,
  initializeModules,
  type FeatureModule,
} from "@/core";
import type { PlaybackState } from "@/core/types";
import { AudioVisualizerModule } from "@/modules/audio-visualizer";
import { HotkeysModule } from "@/modules/hotkeys";
import { MiniPlayerModule } from "@/modules/mini-player";
import { NotificationsModule } from "@/modules/notifications";

const context = createExtensionContext();
const send = createMessageSender();
const audioVisualizer = new AudioVisualizerModule();
const hotkeys = new HotkeysModule(send);
const miniPlayer = new MiniPlayerModule();
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

handler.on("get-notify-on-unpause", async () => {
  return { ok: true, data: notifications.isNotifyOnUnpauseEnabled() };
});

handler.on("set-notify-on-unpause", async (message) => {
  notifications.setNotifyOnUnpause(message.enabled as boolean);
  return { ok: true };
});

handler.on("get-mini-player-enabled", async () => {
  return { ok: true, data: miniPlayer.isEnabled() };
});

handler.on("set-mini-player-enabled", async (message) => {
  miniPlayer.setEnabled(message.enabled as boolean);
  return { ok: true };
});

handler.on("inject-audio-bridge", async (_message, sender) => {
  const tabId = sender?.tab?.id;
  if (tabId === undefined) return { ok: false, error: "No tab ID" };
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["audio-bridge.js"],
    world: "MAIN",
  });
  return { ok: true };
});

handler.on("get-audio-visualizer-enabled", async () => {
  return { ok: true, data: audioVisualizer.isEnabled() };
});

handler.on("set-audio-visualizer-enabled", async (message) => {
  audioVisualizer.setEnabled(message.enabled as boolean);
  return { ok: true };
});

handler.on("get-audio-visualizer-style", async () => {
  return { ok: true, data: audioVisualizer.getStyle() };
});

handler.on("set-audio-visualizer-style", async (message) => {
  audioVisualizer.setStyle(message.style as "bars" | "waveform" | "circular");
  return { ok: true };
});

handler.start();

const modules: FeatureModule[] = [
  audioVisualizer,
  hotkeys,
  miniPlayer,
  notifications,
];

initializeModules(context, modules).catch((err) => {
  console.error("[YTM Enhancer] Failed to initialize modules:", err);
});

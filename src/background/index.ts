import {
  createExtensionContext,
  createMessageHandler,
  createMessageSender,
  initializeModules,
  relayToYTMTab,
  findYTMTab,
  type FeatureModule,
} from "@/core";
import { loadModuleState, saveModuleStateValue } from "@/core/module-state";
import type { PlaybackState } from "@/core/types";
import { AutoPlayModule } from "@/modules/auto-play";
import { AutoSkipDislikedModule } from "@/modules/auto-skip-disliked";
import { AudioVisualizerModule } from "@/modules/audio-visualizer";
import type {
  VisualizerStyle,
  VisualizerTarget,
} from "@/modules/audio-visualizer/styles";
import { HotkeysModule } from "@/modules/hotkeys";
import { MiniPlayerModule } from "@/modules/mini-player";
import { NotificationsModule } from "@/modules/notifications";
import type { NotificationFields } from "@/modules/notifications";
import { PlaybackSpeedModule } from "@/modules/playback-speed";
import { StreamQualityModule } from "@/modules/stream-quality";

const context = createExtensionContext();
const send = createMessageSender();
const autoPlay = new AutoPlayModule();
const autoSkipDisliked = new AutoSkipDislikedModule();
const audioVisualizer = new AudioVisualizerModule();
const hotkeys = new HotkeysModule(send);
const miniPlayer = new MiniPlayerModule();
const notifications = new NotificationsModule();
const playbackSpeed = new PlaybackSpeedModule();
const streamQuality = new StreamQualityModule();

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
  void saveModuleStateValue("notifications.enabled", message.enabled);
  return { ok: true };
});

handler.on("get-notify-on-unpause", async () => {
  return { ok: true, data: notifications.isNotifyOnUnpauseEnabled() };
});

handler.on("set-notify-on-unpause", async (message) => {
  notifications.setNotifyOnUnpause(message.enabled as boolean);
  void saveModuleStateValue("notifications.notifyOnUnpause", message.enabled);
  return { ok: true };
});

handler.on("get-notification-fields", async () => {
  return { ok: true, data: notifications.getFields() };
});

handler.on("set-notification-fields", async (message) => {
  notifications.setFields(message.fields as NotificationFields);
  void saveModuleStateValue("notifications.fields", message.fields);
  return { ok: true };
});

handler.on("get-auto-play-enabled", async () => {
  return { ok: true, data: autoPlay.isEnabled() };
});

handler.on("set-auto-play-enabled", async (message) => {
  autoPlay.setEnabled(message.enabled as boolean);
  void saveModuleStateValue("auto-play.enabled", message.enabled);
  void relayToYTMTab({
    type: "set-auto-play-enabled",
    enabled: message.enabled,
  });
  return { ok: true };
});

handler.on("get-auto-skip-disliked-enabled", async () => {
  return { ok: true, data: autoSkipDisliked.isEnabled() };
});

handler.on("set-auto-skip-disliked-enabled", async (message) => {
  autoSkipDisliked.setEnabled(message.enabled as boolean);
  void saveModuleStateValue("auto-skip-disliked.enabled", message.enabled);
  void relayToYTMTab({
    type: "set-auto-skip-disliked-enabled",
    enabled: message.enabled,
  });
  return { ok: true };
});

handler.on("get-mini-player-enabled", async () => {
  return { ok: true, data: miniPlayer.isEnabled() };
});

handler.on("set-mini-player-enabled", async (message) => {
  miniPlayer.setEnabled(message.enabled as boolean);
  void saveModuleStateValue("mini-player.enabled", message.enabled);
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

handler.on("inject-quality-bridge", async (_message, sender) => {
  const tabId = sender?.tab?.id;
  if (tabId === undefined) return { ok: false, error: "No tab ID" };
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["quality-bridge.js"],
    world: "MAIN",
  });
  return { ok: true };
});

handler.on("get-stream-quality", async () => {
  const tab = await findYTMTab();
  if (tab?.id === undefined) return { ok: false, error: "No YTM tab" };
  const response = await (
    chrome.tabs.sendMessage as (
      tabId: number,
      message: unknown,
    ) => Promise<{ ok: true; data?: unknown }>
  )(tab.id, { type: "get-stream-quality" });
  return response;
});

handler.on("set-stream-quality", async (message) => {
  void relayToYTMTab({
    type: "set-stream-quality",
    value: message.value,
  });
  return { ok: true };
});

handler.on("get-playback-speed", async () => {
  const tab = await findYTMTab();
  if (tab?.id === undefined) return { ok: false, error: "No YTM tab" };
  const response = await (
    chrome.tabs.sendMessage as (
      tabId: number,
      message: unknown,
    ) => Promise<{ ok: true; data?: unknown }>
  )(tab.id, { type: "get-playback-speed" });
  return response;
});

handler.on("set-playback-speed", async (message) => {
  void relayToYTMTab({
    type: "set-playback-speed",
    rate: message.rate,
  });
  return { ok: true };
});

handler.on("get-audio-visualizer-enabled", async () => {
  return { ok: true, data: audioVisualizer.isEnabled() };
});

handler.on("set-audio-visualizer-enabled", async (message) => {
  audioVisualizer.setEnabled(message.enabled as boolean);
  void saveModuleStateValue("audio-visualizer.enabled", message.enabled);
  void relayToYTMTab({
    type: "set-audio-visualizer-enabled",
    enabled: message.enabled,
  });
  return { ok: true };
});

handler.on("get-audio-visualizer-style", async () => {
  return { ok: true, data: audioVisualizer.getStyle() };
});

handler.on("set-audio-visualizer-style", async (message) => {
  audioVisualizer.setStyle(message.style as VisualizerStyle);
  void saveModuleStateValue("audio-visualizer.style", message.style);
  void relayToYTMTab({
    type: "set-audio-visualizer-style",
    style: message.style,
  });
  return { ok: true };
});

handler.on("get-audio-visualizer-target", async () => {
  return { ok: true, data: audioVisualizer.getTarget() };
});

handler.on("set-audio-visualizer-target", async (message) => {
  audioVisualizer.setTarget(message.target as VisualizerTarget);
  void saveModuleStateValue("audio-visualizer.target", message.target);
  void relayToYTMTab({
    type: "set-audio-visualizer-target",
    target: message.target,
  });
  return { ok: true };
});

handler.start();

async function restoreModuleState(): Promise<void> {
  const state = await loadModuleState();

  const bool = (key: string, fallback: boolean) =>
    typeof state[key] === "boolean" ? (state[key] as boolean) : fallback;

  const str = (key: string, fallback: string) =>
    typeof state[key] === "string" ? (state[key] as string) : fallback;

  notifications.setEnabled(bool("notifications.enabled", true));
  notifications.setNotifyOnUnpause(
    bool("notifications.notifyOnUnpause", false),
  );
  if (
    typeof state["notifications.fields"] === "object" &&
    state["notifications.fields"] !== null
  ) {
    notifications.setFields(
      state["notifications.fields"] as NotificationFields,
    );
  }
  autoPlay.setEnabled(bool("auto-play.enabled", false));
  autoSkipDisliked.setEnabled(bool("auto-skip-disliked.enabled", false));
  audioVisualizer.setEnabled(bool("audio-visualizer.enabled", true));
  audioVisualizer.setStyle(
    str("audio-visualizer.style", "bars") as VisualizerStyle,
  );
  audioVisualizer.setTarget(
    str("audio-visualizer.target", "auto") as VisualizerTarget,
  );
  miniPlayer.setEnabled(bool("mini-player.enabled", true));
}

const modules: FeatureModule[] = [
  autoPlay,
  autoSkipDisliked,
  audioVisualizer,
  hotkeys,
  miniPlayer,
  notifications,
  playbackSpeed,
  streamQuality,
];

Promise.all([restoreModuleState(), initializeModules(context, modules)]).catch(
  (err) => {
    console.error("[YTM Enhancer] Failed to initialize modules:", err);
  },
);

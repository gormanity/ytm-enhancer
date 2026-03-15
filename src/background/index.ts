import {
  ActionExecutor,
  createExtensionContext,
  createMessageHandler,
  createMessageSender,
  HotkeyRegistry,
  initializeModules,
  relayToYTMTab,
  findYTMTab,
  type FeatureModule,
  type PlaybackAction,
} from "@/core";
import { findAllYTMTabs } from "@/core/tab-finder";
import { loadModuleState, saveModuleStateValue } from "@/core/module-state";
import type { PlaybackState } from "@/core/types";

import { parseSelectedTabId, resolveSelectedTabId } from "./selected-tab";
import { AutoPlayModule } from "@/modules/auto-play";
import { AutoSkipDislikedModule } from "@/modules/auto-skip-disliked";
import { AudioVisualizerModule } from "@/modules/audio-visualizer";
import type {
  VisualizerColorMode,
  VisualizerStyleTuning,
  VisualizerStyleTunings,
  VisualizerStyle,
  VisualizerTarget,
} from "@/modules/audio-visualizer/styles";
import { HotkeysModule } from "@/modules/hotkeys";
import { MiniPlayerModule } from "@/modules/mini-player";
import { NotificationsModule } from "@/modules/notifications";
import type { NotificationFields } from "@/modules/notifications";
import { PlaybackControlsModule } from "@/modules/playback-controls";
import { SleepTimerModule } from "@/modules/sleep-timer";

const context = createExtensionContext();
const send = createMessageSender();
const executor = new ActionExecutor(send);
const hotkeyRegistry = new HotkeyRegistry();
const autoPlay = new AutoPlayModule();
const autoSkipDisliked = new AutoSkipDislikedModule();
const audioVisualizer = new AudioVisualizerModule();
const hotkeys = new HotkeysModule();
const miniPlayer = new MiniPlayerModule();
const notifications = new NotificationsModule();
const playbackControls = new PlaybackControlsModule();
const sleepTimer = new SleepTimerModule();
let selectedTabId: number | null = null;
const pipOpenTabIds = new Set<number>();
const SLEEP_TIMER_ALARM = "sleep-timer";
const TAB_ARTWORK_QUERY_TIMEOUT_MS = 150;
let sleepTimerEndAt: number | null = null;
let sleepTimerLastPausedAt: number | null = null;
let sleepTimerNotifyOnEnd = true;
let sleepTimerMode: "duration" | "absolute" = "duration";
type PopupRuntimeMessage =
  | { type: "ytm-tabs-changed" }
  | { type: "sleep-timer-state-changed" };

function broadcastPopupMessage(message: PopupRuntimeMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => {
    // It's normal for there to be no popup listener.
  });
}

function notifyYtmTabsChanged(): void {
  broadcastPopupMessage({ type: "ytm-tabs-changed" });
}

function notifySleepTimerStateChanged(): void {
  broadcastPopupMessage({ type: "sleep-timer-state-changed" });
}

async function relayToSelectedTab(message: unknown): Promise<void> {
  const tab = await findYTMTab(selectedTabId);
  if (tab?.id === undefined) return;
  void chrome.tabs.sendMessage(tab.id, message);
}

async function hasContentScript(tabId: number): Promise<boolean> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "get-playback-state",
    })) as { ok?: boolean } | undefined;
    return typeof response?.ok === "boolean";
  } catch {
    return false;
  }
}

async function ensureYtmContentScripts(): Promise<void> {
  const tabs = await findAllYTMTabs();

  await Promise.allSettled(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      if (await hasContentScript(tab.id)) return;

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    }),
  );
}

async function cancelSleepTimer(): Promise<void> {
  sleepTimerEndAt = null;
  await chrome.alarms.clear(SLEEP_TIMER_ALARM);
  await saveModuleStateValue("sleep-timer.endAt", null);
  notifySleepTimerStateChanged();
}

async function startSleepTimer(durationMs: number): Promise<void> {
  const endAt = Date.now() + durationMs;
  sleepTimerEndAt = endAt;
  sleepTimerLastPausedAt = null;
  await chrome.alarms.clear(SLEEP_TIMER_ALARM);
  await chrome.alarms.create(SLEEP_TIMER_ALARM, { when: endAt });
  await saveModuleStateValue("sleep-timer.endAt", endAt);
  await saveModuleStateValue("sleep-timer.lastPausedAt", null);
  notifySleepTimerStateChanged();
}

function getSleepTimerState(): {
  active: boolean;
  remainingMs: number;
  endAt: number | null;
  lastPausedAt: number | null;
} {
  if (sleepTimerEndAt === null) {
    return {
      active: false,
      remainingMs: 0,
      endAt: null,
      lastPausedAt: sleepTimerLastPausedAt,
    };
  }
  const remainingMs = Math.max(0, sleepTimerEndAt - Date.now());
  if (remainingMs <= 0) {
    return {
      active: false,
      remainingMs: 0,
      endAt: null,
      lastPausedAt: sleepTimerLastPausedAt,
    };
  }
  return {
    active: true,
    remainingMs,
    endAt: sleepTimerEndAt,
    lastPausedAt: sleepTimerLastPausedAt,
  };
}

const COMMAND_ACTION_MAP: Record<string, PlaybackAction> = {
  "play-pause": "togglePlay",
  "next-track": "next",
  "previous-track": "previous",
};

for (const [cmd, action] of Object.entries(COMMAND_ACTION_MAP)) {
  hotkeyRegistry.register(cmd, async () => {
    const tab = await findYTMTab(selectedTabId);
    if (!tab?.id) return;
    try {
      await executor.execute(action, tab.id);
    } catch (err) {
      console.error("[YTM Enhancer] Hotkey action failed:", err);
    }
  });
}

hotkeyRegistry.register("focus-ytm-tab", async () => {
  const tab = await findYTMTab(selectedTabId);
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
});

// Chrome MV3 service workers require event listeners to be registered
// synchronously at the top level of the script, during the first turn
// of the event loop. Registering inside an async init() is too late.
chrome.commands.onCommand.addListener((command: string) => {
  void hotkeyRegistry.dispatch(command);
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureYtmContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureYtmContentScripts();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SLEEP_TIMER_ALARM) return;
  sleepTimerLastPausedAt = Date.now();
  sleepTimerEndAt = null;
  void saveModuleStateValue("sleep-timer.endAt", null);
  void saveModuleStateValue("sleep-timer.lastPausedAt", sleepTimerLastPausedAt);
  if (sleepTimerNotifyOnEnd) {
    const pausedAtLabel = new Date(sleepTimerLastPausedAt).toLocaleTimeString(
      [],
      {
        hour: "numeric",
        minute: "2-digit",
      },
    );
    void chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Sleep Timer",
      message: `Playback paused at ${pausedAtLabel}`,
    });
  }
  void relayToSelectedTab({
    type: "playback-action",
    action: "pause",
  });
  notifySleepTimerStateChanged();
});

const handler = createMessageHandler();

handler.on("track-changed", async (message) => {
  if (
    miniPlayer.isSuppressNotificationsWhilePipOpenEnabled() &&
    pipOpenTabIds.size > 0
  ) {
    return { ok: true };
  }
  notifications.handleTrackChange(message.state as PlaybackState);
  return { ok: true };
});

async function queryTabArtworkWithTimeout(
  tabId: number,
): Promise<string | null> {
  try {
    const responsePromise = chrome.tabs.sendMessage(tabId, {
      type: "get-playback-state",
    }) as Promise<{ ok: boolean; data?: PlaybackState }>;

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), TAB_ARTWORK_QUERY_TIMEOUT_MS);
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);
    if (response && typeof response === "object" && response.ok) {
      return response.data?.artworkUrl ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

handler.on("get-ytm-tabs", async () => {
  const tabs = await findAllYTMTabs();
  const nextSelectedTabId = resolveSelectedTabId(tabs, selectedTabId);
  if (nextSelectedTabId !== selectedTabId) {
    selectedTabId = nextSelectedTabId;
    void saveModuleStateValue("tabs.selectedTabId", selectedTabId);
    notifyYtmTabsChanged();
  }

  const tabData = tabs.map((tab) => ({
    id: tab.id ?? null,
    title: tab.title ?? "YouTube Music",
    artworkUrl: null,
    isSelected: tab.id === selectedTabId,
  }));

  return { ok: true, data: { tabs: tabData, selectedTabId } };
});

handler.on("get-ytm-tab-artwork", async (message) => {
  const tabId =
    typeof message.tabId === "number" ? (message.tabId as number) : null;
  if (tabId === null) return { ok: false, error: "Invalid tab ID" };
  const artworkUrl = await queryTabArtworkWithTimeout(tabId);
  return { ok: true, data: { artworkUrl } };
});

handler.on("set-selected-tab", async (message) => {
  const tabId =
    typeof message.tabId === "number" ? (message.tabId as number) : null;
  selectedTabId = tabId;
  await saveModuleStateValue("tabs.selectedTabId", selectedTabId);
  notifyYtmTabsChanged();
  return { ok: true };
});

handler.on("focus-ytm-tab", async (message) => {
  const requestedTabId =
    typeof message.tabId === "number" ? (message.tabId as number) : null;
  const tab = await findYTMTab(requestedTabId ?? selectedTabId);
  if (!tab?.id) return { ok: false, error: "No YTM tab" };

  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
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

handler.on("preview-notification", async () => {
  notifications.triggerPreview();
  return { ok: true };
});

handler.on("get-auto-play-enabled", async () => {
  return { ok: true, data: autoPlay.isEnabled() };
});

handler.on("set-auto-play-enabled", async (message) => {
  autoPlay.setEnabled(message.enabled as boolean);
  await saveModuleStateValue("auto-play.enabled", message.enabled);
  void relayToYTMTab({
    type: "set-auto-play-enabled",
    enabled: message.enabled,
  }).catch(() => {
    // Tab may be navigating/reloading; state is already persisted.
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

handler.on("get-mini-player-suppress-notifications", async () => {
  return {
    ok: true,
    data: miniPlayer.isSuppressNotificationsWhilePipOpenEnabled(),
  };
});

handler.on("set-mini-player-suppress-notifications", async (message) => {
  miniPlayer.setSuppressNotificationsWhilePipOpen(message.enabled as boolean);
  void saveModuleStateValue(
    "mini-player.suppressNotificationsWhilePipOpen",
    message.enabled,
  );
  return { ok: true };
});

handler.on("pip-open-state", async (message, sender) => {
  const tabId = sender?.tab?.id;
  if (tabId === undefined) return { ok: false, error: "No tab ID" };
  if (message.open === true) {
    pipOpenTabIds.add(tabId);
  } else {
    pipOpenTabIds.delete(tabId);
  }
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
  const tab = await findYTMTab(selectedTabId);
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
  void relayToSelectedTab({
    type: "set-stream-quality",
    value: message.value,
  });
  return { ok: true };
});

handler.on("get-playback-speed", async () => {
  const tab = await findYTMTab(selectedTabId);
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
  void relayToSelectedTab({
    type: "set-playback-speed",
    rate: message.rate,
  });
  return { ok: true };
});

handler.on("get-volume", async () => {
  const tab = await findYTMTab(selectedTabId);
  if (tab?.id === undefined) return { ok: false, error: "No YTM tab" };
  const response = await (
    chrome.tabs.sendMessage as (
      tabId: number,
      message: unknown,
    ) => Promise<{ ok: true; data?: unknown }>
  )(tab.id, { type: "get-volume" });
  return response;
});

handler.on("set-volume", async (message) => {
  void relayToSelectedTab({
    type: "set-volume",
    volume: message.volume,
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
  void relayToYTMTab({
    type: "set-audio-visualizer-color-mode",
    mode: audioVisualizer.getColorMode(),
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

handler.on("get-audio-visualizer-style-tunings", async () => {
  return { ok: true, data: audioVisualizer.getStyleTunings() };
});

handler.on("set-audio-visualizer-style-tuning", async (message) => {
  audioVisualizer.setStyleTuning(
    message.style as VisualizerStyle,
    message.tuning as VisualizerStyleTuning,
  );
  const tunings = audioVisualizer.getStyleTunings();
  void saveModuleStateValue("audio-visualizer.styleTunings", tunings);
  void relayToYTMTab({
    type: "set-audio-visualizer-style-tunings",
    tunings,
  });
  return { ok: true };
});

handler.on("get-audio-visualizer-color-mode", async () => {
  return { ok: true, data: audioVisualizer.getColorMode() };
});

handler.on("set-audio-visualizer-color-mode", async (message) => {
  audioVisualizer.setColorMode(message.mode as VisualizerColorMode);
  void saveModuleStateValue(
    "audio-visualizer.styleTunings",
    audioVisualizer.getStyleTunings(),
  );
  void relayToYTMTab({
    type: "set-audio-visualizer-color-mode",
    mode: message.mode,
  });
  return { ok: true };
});

handler.on("get-playback-state", async () => {
  const tab = await findYTMTab(selectedTabId);
  if (tab?.id === undefined) return { ok: false, error: "No YTM tab" };
  const response = await (
    chrome.tabs.sendMessage as (
      tabId: number,
      message: unknown,
    ) => Promise<{ ok: true; data?: PlaybackState }>
  )(tab.id, { type: "get-playback-state" });
  return response;
});

handler.on("get-sleep-timer-state", async () => {
  return { ok: true, data: getSleepTimerState() };
});

handler.on("start-sleep-timer", async (message) => {
  const durationMs = Number(message.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, error: "Invalid duration" };
  }
  await startSleepTimer(durationMs);
  return { ok: true };
});

handler.on("cancel-sleep-timer", async () => {
  await cancelSleepTimer();
  return { ok: true };
});

handler.on("get-sleep-timer-notify-enabled", async () => {
  return { ok: true, data: sleepTimerNotifyOnEnd };
});

handler.on("set-sleep-timer-notify-enabled", async (message) => {
  sleepTimerNotifyOnEnd = message.enabled === true;
  await saveModuleStateValue("sleep-timer.notifyOnEnd", sleepTimerNotifyOnEnd);
  return { ok: true };
});

handler.on("get-sleep-timer-mode", async () => {
  return { ok: true, data: sleepTimerMode };
});

handler.on("set-sleep-timer-mode", async (message) => {
  sleepTimerMode = message.mode === "absolute" ? "absolute" : "duration";
  await saveModuleStateValue("sleep-timer.mode", sleepTimerMode);
  return { ok: true };
});

handler.on("playback-action", async (message) => {
  void relayToSelectedTab({
    type: "playback-action",
    action: message.action,
  });
  return { ok: true };
});

handler.start();
void ensureYtmContentScripts();

chrome.tabs.onRemoved.addListener((tabId) => {
  pipOpenTabIds.delete(tabId);
  notifyYtmTabsChanged();
});

chrome.tabs.onActivated.addListener(() => {
  notifyYtmTabsChanged();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.url?.startsWith("https://music.youtube.com/")) {
    notifyYtmTabsChanged();
    return;
  }
  if (changeInfo.url?.startsWith("https://music.youtube.com/")) {
    notifyYtmTabsChanged();
    return;
  }
  if (changeInfo.status === "complete") {
    notifyYtmTabsChanged();
  }
});

async function restoreModuleState(): Promise<void> {
  const state = await loadModuleState();

  const bool = (key: string, fallback: boolean) =>
    typeof state[key] === "boolean" ? (state[key] as boolean) : fallback;

  const str = (key: string, fallback: string) =>
    typeof state[key] === "string" ? (state[key] as string) : fallback;
  const num = (key: string) =>
    typeof state[key] === "number" ? (state[key] as number) : null;

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
  const legacyColorMode = str(
    "audio-visualizer.colorMode",
    "white",
  ) as VisualizerColorMode;
  if (
    typeof state["audio-visualizer.styleTunings"] === "object" &&
    state["audio-visualizer.styleTunings"] !== null
  ) {
    audioVisualizer.setStyleTunings(
      state["audio-visualizer.styleTunings"] as VisualizerStyleTunings,
      legacyColorMode,
    );
  } else {
    audioVisualizer.setAllStyleColorModes(legacyColorMode);
  }
  miniPlayer.setEnabled(bool("mini-player.enabled", true));
  miniPlayer.setSuppressNotificationsWhilePipOpen(
    bool("mini-player.suppressNotificationsWhilePipOpen", false),
  );
  selectedTabId = parseSelectedTabId(state["tabs.selectedTabId"]);

  const restoredSleepTimerEndAt = num("sleep-timer.endAt");
  sleepTimerLastPausedAt = num("sleep-timer.lastPausedAt");
  sleepTimerNotifyOnEnd = bool("sleep-timer.notifyOnEnd", true);
  sleepTimerMode =
    state["sleep-timer.mode"] === "absolute" ? "absolute" : "duration";
  if (
    restoredSleepTimerEndAt !== null &&
    restoredSleepTimerEndAt > Date.now()
  ) {
    sleepTimerEndAt = restoredSleepTimerEndAt;
    await chrome.alarms.create(SLEEP_TIMER_ALARM, {
      when: restoredSleepTimerEndAt,
    });
  } else {
    sleepTimerEndAt = null;
    await chrome.alarms.clear(SLEEP_TIMER_ALARM);
    void saveModuleStateValue("sleep-timer.endAt", null);
  }
}

const modules: FeatureModule[] = [
  autoPlay,
  autoSkipDisliked,
  audioVisualizer,
  hotkeys,
  miniPlayer,
  notifications,
  playbackControls,
  sleepTimer,
];

Promise.all([restoreModuleState(), initializeModules(context, modules)]).catch(
  (err) => {
    console.error("[YTM Enhancer] Failed to initialize modules:", err);
  },
);

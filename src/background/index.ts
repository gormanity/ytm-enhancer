import {
  createExtensionContext,
  createMessageHandler,
  createYtmRuntimeClient,
  HotkeyRegistry,
  initializeModules,
  type FeatureModule,
  type AutoPlayMode,
  type PlaybackAction,
} from "@/core";
import { DEV_BUILD_STALE_MS } from "@/runtime-messages";
import { findAllYTMTabs } from "@/core/tab-finder";
import { loadModuleState, saveModuleStateValue } from "@/core/module-state";
import type { PlaybackState } from "@/core/types";
import { error } from "@/core/logger";

import { parseSelectedTabId } from "./selected-tab";
import {
  isDevBuildConflictActive,
  isActionSuppressedForDevBuildConflict,
  setActionDevBuildConflictIndicator,
  updateDevBuildSuspendedTab,
  type DevBuildConflictState,
} from "./dev-build-conflict";
import { createDevBuildPresenceCoordinator } from "./dev-build-presence";
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
const autoPlayPolicyBlockedTabIds = new Set<number>();
const devBuildSuspendedTabIds = new Set<number>();
const devBuildConflictState: DevBuildConflictState = {
  suspendedTabIds: devBuildSuspendedTabIds,
  externalDevBuildPresent: false,
};
const SLEEP_TIMER_ALARM = "sleep-timer";
const TAB_ARTWORK_QUERY_TIMEOUT_MS = 150;
let sleepTimerEndAt: number | null = null;
let sleepTimerLastPausedAt: number | null = null;
let sleepTimerNotifyOnEnd = true;
let sleepTimerMode: "duration" | "absolute" = "duration";
let externalDevBuildStaleTimer: ReturnType<typeof setTimeout> | null = null;
type PopupRuntimeMessage =
  | { type: "ytm-tabs-changed" }
  | { type: "sleep-timer-state-changed" }
  | { type: "auto-play-status-changed" }
  | { type: "dev-build-conflict-status-changed" };

function broadcastPopupMessage(message: PopupRuntimeMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => {
    // It's normal for there to be no popup listener.
  });
}

function notifyYtmTabsChanged(): void {
  broadcastPopupMessage({ type: "ytm-tabs-changed" });
}

const ytm = createYtmRuntimeClient({
  getSelectedTabId: () => selectedTabId,
  setSelectedTabId: async (tabId) => {
    selectedTabId = tabId;
    await saveModuleStateValue("tabs.selectedTabId", selectedTabId);
  },
  isTabSuppressed: (tabId) =>
    isActionSuppressedForDevBuildConflict(devBuildConflictState, tabId),
  onTabsChanged: notifyYtmTabsChanged,
  tabArtworkQueryTimeoutMs: TAB_ARTWORK_QUERY_TIMEOUT_MS,
});

function notifySleepTimerStateChanged(): void {
  broadcastPopupMessage({ type: "sleep-timer-state-changed" });
}

function notifyAutoPlayStatusChanged(): void {
  broadcastPopupMessage({ type: "auto-play-status-changed" });
}

function notifyDevBuildConflictStatusChanged(): void {
  broadcastPopupMessage({ type: "dev-build-conflict-status-changed" });
  setActionDevBuildConflictIndicator(
    isDevBuildConflictActive(devBuildConflictState),
    __DEV__,
  );
}

function updateDevBuildConflictState(
  update: () => void,
  forceNotify = false,
): void {
  const wasDuplicateDisabled = isDevBuildConflictActive(devBuildConflictState);
  update();
  const isDuplicateDisabled = isDevBuildConflictActive(devBuildConflictState);
  if (forceNotify || isDuplicateDisabled !== wasDuplicateDisabled) {
    notifyDevBuildConflictStatusChanged();
  }
}

function setExternalDevBuildPresent(present: boolean): void {
  updateDevBuildConflictState(() => {
    devBuildConflictState.externalDevBuildPresent = present;
  });
}

function markExternalDevBuildPresent(): void {
  setExternalDevBuildPresent(true);
  if (externalDevBuildStaleTimer !== null) {
    clearTimeout(externalDevBuildStaleTimer);
  }
  externalDevBuildStaleTimer = setTimeout(() => {
    externalDevBuildStaleTimer = null;
    setExternalDevBuildPresent(false);
  }, DEV_BUILD_STALE_MS);
}

const devBuildPresenceCoordinator = createDevBuildPresenceCoordinator({
  isDevBuild: __DEV__,
  runtime: chrome.runtime,
  onDevPresent: markExternalDevBuildPresent,
});

function isAutoPlayMode(value: unknown): value is AutoPlayMode {
  return value === "default" || value === "off" || value === "on";
}

function normalizeAutoPlayMode(value: unknown): AutoPlayMode {
  return isAutoPlayMode(value) ? value : "default";
}

async function relayToAnyYTMTab(message: unknown): Promise<void> {
  await ytm
    .broadcast(message as Record<string, unknown>)
    .catch(() => undefined);
}

function isYTMTabSuppressed(tabId: number | undefined): boolean {
  return isActionSuppressedForDevBuildConflict(devBuildConflictState, tabId);
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
    try {
      await ytm.executePlaybackAction(action);
    } catch (err) {
      error("Hotkey action failed:", err);
    }
  });
}

hotkeyRegistry.register("focus-ytm-tab", async () => {
  await ytm.focusTab().catch(() => undefined);
});

hotkeyRegistry.register("remind-me", async () => {
  try {
    const state = await ytm.getPlaybackState();
    notifications.showReminder(state);
  } catch {
    // Tab may not have the content script loaded.
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
  void ytm.executePlaybackAction("pause").catch(() => undefined);
  notifySleepTimerStateChanged();
});

const handler = createMessageHandler();

handler.on("dev-build-liveness-check", async () => {
  return { ok: true };
});

handler.on("track-changed", async (message, sender) => {
  if (isYTMTabSuppressed(sender?.tab?.id)) {
    return { ok: true };
  }
  if (
    miniPlayer.isSuppressNotificationsWhilePipOpenEnabled() &&
    pipOpenTabIds.size > 0
  ) {
    return { ok: true };
  }
  notifications.handleTrackChange(message.state as PlaybackState);
  return { ok: true };
});

handler.on("get-ytm-tabs", async () => {
  return { ok: true, data: await ytm.listTabs() };
});

handler.on("get-ytm-tab-artwork", async (message) => {
  const tabId =
    typeof message.tabId === "number" ? (message.tabId as number) : null;
  if (tabId === null) return { ok: false, error: "Invalid tab ID" };
  const artworkUrl = await ytm.getTabArtwork(tabId);
  return { ok: true, data: { artworkUrl } };
});

handler.on("set-selected-tab", async (message) => {
  const tabId =
    typeof message.tabId === "number" ? (message.tabId as number) : null;
  await ytm.selectTab(tabId);
  return { ok: true };
});

handler.on("focus-ytm-tab", async (message) => {
  const requestedTabId =
    typeof message.tabId === "number" ? (message.tabId as number) : null;
  await ytm.focusTab(requestedTabId);
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

handler.on("get-auto-play-mode", async () => {
  return { ok: true, data: autoPlay.getMode() };
});

handler.on("get-auto-play-status", async () => {
  const tabState = await ytm.listTabs();
  const browserAutoplayBlocked =
    tabState.selectedTabId !== null &&
    autoPlayPolicyBlockedTabIds.has(tabState.selectedTabId);
  return { ok: true, data: { browserAutoplayBlocked } };
});

handler.on("content-runtime-dev-build-suspension", async (message, sender) => {
  const tabId = sender?.tab?.id;
  if (tabId === undefined) return { ok: false, error: "No tab ID" };

  updateDevBuildConflictState(() => {
    updateDevBuildSuspendedTab(
      devBuildSuspendedTabIds,
      tabId,
      message.suspended === true,
    );
  });

  return { ok: true };
});

handler.on("get-dev-build-conflict-status", async () => {
  await devBuildPresenceCoordinator.probeDevPresence();
  return {
    ok: true,
    data: {
      duplicateDetected: isDevBuildConflictActive(devBuildConflictState),
    },
  };
});

handler.on("set-auto-play-policy-blocked", async (message, sender) => {
  const tabId = sender?.tab?.id;
  if (tabId === undefined) return { ok: false, error: "No tab ID" };

  const wasBlocked = autoPlayPolicyBlockedTabIds.has(tabId);
  if (message.blocked === true) {
    autoPlayPolicyBlockedTabIds.add(tabId);
  } else {
    autoPlayPolicyBlockedTabIds.delete(tabId);
  }

  const isBlocked = autoPlayPolicyBlockedTabIds.has(tabId);
  if (isBlocked !== wasBlocked) {
    notifyAutoPlayStatusChanged();
  }

  return { ok: true };
});

handler.on("set-auto-play-enabled", async (message) => {
  const mode: AutoPlayMode = message.enabled === true ? "on" : "off";
  autoPlay.setMode(mode);
  if (mode !== "on") {
    autoPlayPolicyBlockedTabIds.clear();
    notifyAutoPlayStatusChanged();
  }
  await saveModuleStateValue("auto-play.mode", mode);
  await saveModuleStateValue("auto-play.enabled", message.enabled);
  void relayToAnyYTMTab({
    type: "set-auto-play-mode",
    mode,
  }).catch(() => {
    // Tab may be navigating/reloading; state is already persisted.
  });
  return { ok: true };
});

handler.on("set-auto-play-mode", async (message) => {
  const mode = normalizeAutoPlayMode(message.mode);
  autoPlay.setMode(mode);
  if (mode !== "on") {
    autoPlayPolicyBlockedTabIds.clear();
    notifyAutoPlayStatusChanged();
  }
  await saveModuleStateValue("auto-play.mode", mode);
  void relayToAnyYTMTab({
    type: "set-auto-play-mode",
    mode,
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
  void relayToAnyYTMTab({
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
  if (isYTMTabSuppressed(tabId)) {
    return { ok: false, error: "Disabled while the dev build is active" };
  }
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
  if (isYTMTabSuppressed(tabId)) {
    return { ok: false, error: "Disabled while the dev build is active" };
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["quality-bridge.js"],
    world: "MAIN",
  });
  return { ok: true };
});

handler.on("get-stream-quality", async () => {
  return { ok: true, data: await ytm.getStreamQuality() };
});

handler.on("set-stream-quality", async (message) => {
  void ytm.setStreamQuality(String(message.value)).catch(() => undefined);
  return { ok: true };
});

handler.on("get-playback-speed", async () => {
  return { ok: true, data: await ytm.getPlaybackSpeed() };
});

handler.on("set-playback-speed", async (message) => {
  void ytm.setPlaybackSpeed(Number(message.rate)).catch(() => undefined);
  return { ok: true };
});

handler.on("get-volume", async () => {
  return { ok: true, data: await ytm.getVolume() };
});

handler.on("set-volume", async (message) => {
  void ytm.setVolume(Number(message.volume)).catch(() => undefined);
  return { ok: true };
});

handler.on("get-audio-visualizer-enabled", async () => {
  return { ok: true, data: audioVisualizer.isEnabled() };
});

handler.on("set-audio-visualizer-enabled", async (message) => {
  audioVisualizer.setEnabled(message.enabled as boolean);
  void saveModuleStateValue("audio-visualizer.enabled", message.enabled);
  void relayToAnyYTMTab({
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
  void relayToAnyYTMTab({
    type: "set-audio-visualizer-style",
    style: message.style,
  });
  void relayToAnyYTMTab({
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
  void relayToAnyYTMTab({
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
  void relayToAnyYTMTab({
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
  void relayToAnyYTMTab({
    type: "set-audio-visualizer-color-mode",
    mode: message.mode,
  });
  return { ok: true };
});

handler.on("get-playback-state", async () => {
  return { ok: true, data: await ytm.getPlaybackState() };
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
  if (message.action === "seekTo") {
    if (typeof message.time !== "number") {
      return { ok: false, error: "Invalid seek time" };
    }
    void ytm.seekTo(message.time).catch(() => undefined);
    return { ok: true };
  }

  void ytm
    .executePlaybackAction(message.action as PlaybackAction)
    .catch(() => undefined);
  return { ok: true };
});

handler.start();
devBuildPresenceCoordinator.registerExternalListener();
devBuildPresenceCoordinator.startDevHeartbeat();
void devBuildPresenceCoordinator.probeDevPresence();
void ensureYtmContentScripts();

chrome.tabs.onRemoved.addListener((tabId) => {
  pipOpenTabIds.delete(tabId);
  if (autoPlayPolicyBlockedTabIds.delete(tabId)) {
    notifyAutoPlayStatusChanged();
  }
  updateDevBuildConflictState(() => {
    devBuildSuspendedTabIds.delete(tabId);
  });
  notifyYtmTabsChanged();
});

chrome.tabs.onActivated.addListener(() => {
  notifyYtmTabsChanged();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (
    (changeInfo.status === "loading" || changeInfo.url !== undefined) &&
    _tabId !== undefined
  ) {
    if (autoPlayPolicyBlockedTabIds.delete(_tabId)) {
      notifyAutoPlayStatusChanged();
    }
    updateDevBuildConflictState(() => {
      devBuildSuspendedTabIds.delete(_tabId);
    });
  }

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
  const autoPlayMode = (): AutoPlayMode => {
    const mode = state["auto-play.mode"];
    if (isAutoPlayMode(mode)) return mode;
    if (typeof state["auto-play.enabled"] === "boolean") {
      return state["auto-play.enabled"] ? "on" : "off";
    }
    return "default";
  };

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
  autoPlay.setMode(autoPlayMode());
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

const modulesReady = Promise.all([
  restoreModuleState(),
  initializeModules(context, modules),
])
  .then(() => {
    void broadcastVisualizerSettings();
  })
  .catch((err) => {
    error("Failed to initialize modules:", err);
  });

handler.setReadyGate(() => modulesReady);

async function broadcastVisualizerSettings(): Promise<void> {
  const tabs = await findAllYTMTabs();
  const tunings = audioVisualizer.getStyleTunings();
  const messages = [
    {
      type: "set-audio-visualizer-enabled",
      enabled: audioVisualizer.isEnabled(),
    },
    { type: "set-audio-visualizer-style", style: audioVisualizer.getStyle() },
    {
      type: "set-audio-visualizer-target",
      target: audioVisualizer.getTarget(),
    },
    { type: "set-audio-visualizer-style-tunings", tunings },
    {
      type: "set-audio-visualizer-color-mode",
      mode: audioVisualizer.getColorMode(),
    },
  ];
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    if (isYTMTabSuppressed(tab.id)) continue;
    for (const message of messages) {
      void chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab may not have a content script yet; that's fine.
      });
    }
  }
}

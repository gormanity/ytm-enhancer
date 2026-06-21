import {
  createExtensionContext,
  AlarmRegistry,
  createMessageHandler,
  createYtmRuntimeClient,
  HotkeyRegistry,
  initializeModules,
  NotificationClickRegistry,
  registerModuleAlarms,
  registerModuleHandlers,
  registerModuleHotkeys,
  registerModuleNotificationClicks,
  syncModuleContentState,
  type FeatureModule,
  type AutoPlayMode,
  type PlaybackState,
} from "@/core";
import { createConnectorHost, type ConnectorHost } from "@/core/connectors";
import { createNativeMessagingTransport } from "@/core/connectors/native-messaging-transport";
import {
  CONNECTORS_ENABLED_STATE_KEY,
  CONNECTORS_KNOWN_STATE_KEY,
  createConnectedAppsSettings,
  FIRST_PARTY_CONNECTED_APP_DEFINITIONS,
  FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
  firstPartyConnectedAppDefinition,
  normalizeKnownConnectors,
  setKnownConnectorEnabled,
  upsertKnownConnector,
  type ConnectedAppAvailability,
  type FirstPartyConnectedApp,
  type ConnectorStatus,
  type KnownConnector,
} from "@/core/connectors/settings";
import type { ConnectorManifest } from "@ytm-enhancer/connector-protocol";
import { DEV_BUILD_STALE_MS } from "@/runtime-messages";
import { findAllYTMTabs } from "@/core/tab-finder";
import { loadModuleState, saveModuleStateValue } from "@/core/module-state";
import { debug, error } from "@/core/logger";
import { handlePlaybackActionMessage } from "./playback-action";
import { setActionPlaybackIndicator } from "./action-icon";

import { parseSelectedTabId } from "./selected-tab";
import { handleTrackChangedMessage } from "./track-change";
import {
  isDevBuildConflictActive,
  isActionSuppressedForDevBuildConflict,
  setActionDevBuildConflictIndicator,
  shouldForwardHotkeyToDevBuild,
  updateDevBuildSuspendedTab,
  type DevBuildConflictState,
} from "./dev-build-conflict";
import {
  createDevBuildPresenceCoordinator,
  forwardHotkeyCommandToDevBuild,
} from "./dev-build-presence";
import { AutoPlayModule } from "@/modules/auto-play";
import { AutoSkipDislikedModule } from "@/modules/auto-skip-disliked";
import { AudioVisualizerModule } from "@/modules/audio-visualizer";
import type {
  VisualizerColorMode,
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

const hotkeyRegistry = new HotkeyRegistry();
const alarmRegistry = new AlarmRegistry();
const notificationClickRegistry = new NotificationClickRegistry();
const autoPlay = new AutoPlayModule();
const autoSkipDisliked = new AutoSkipDislikedModule();
const audioVisualizer = new AudioVisualizerModule();
const hotkeys = new HotkeysModule();
const miniPlayer = new MiniPlayerModule();
const notifications = new NotificationsModule();
const playbackControls = new PlaybackControlsModule();
const sleepTimer = new SleepTimerModule();
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
let selectedTabId: number | null = null;
let connectorHost: ConnectorHost | null = null;
let connectorSupportEnabled = false;
let knownConnectors = new Map<string, KnownConnector>();
interface NativeHostDiagnostic {
  availability: ConnectedAppAvailability;
  lastError: string | null;
  lastCheckedAt: number | null;
}

let firstPartyNativeHostDiagnostics = new Map<string, NativeHostDiagnostic>();
const FIRST_PARTY_NATIVE_HOST_RECHECK_COOLDOWN_MS = 1000;
const devBuildSuspendedTabIds = new Set<number>();
const devBuildConflictState: DevBuildConflictState = {
  suspendedTabIds: devBuildSuspendedTabIds,
  externalDevBuildPresent: false,
};
const TAB_ARTWORK_QUERY_TIMEOUT_MS = 150;
let externalDevBuildStaleTimer: ReturnType<typeof setTimeout> | null = null;
let lastPlaybackStateIsPlaying = false;
type PopupRuntimeMessage =
  | { type: "ytm-tabs-changed" }
  | { type: "sleep-timer-state-changed" }
  | { type: "auto-play-status-changed" }
  | { type: "dev-build-conflict-status-changed" }
  | { type: "connected-apps-state-changed" };

function broadcastPopupMessage(message: PopupRuntimeMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => {
    // It's normal for there to be no popup listener.
  });
}

function notifyYtmTabsChanged(): void {
  broadcastPopupMessage({ type: "ytm-tabs-changed" });
}

function notifyConnectedAppsChanged(): void {
  broadcastPopupMessage({ type: "connected-apps-state-changed" });
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
const context = createExtensionContext({
  ytm,
  state: { saveValue: saveModuleStateValue },
  popupEvents: { broadcast: broadcastPopupMessage },
});

context.events.on<PlaybackState>("playback-state-changed", (state) => {
  updatePlaybackStateIndicators(state);
});

function updatePlaybackStateIndicators(state: PlaybackState): void {
  lastPlaybackStateIsPlaying = state.isPlaying;
  void connectorHost?.publishPlaybackState(state);
  void setActionPlaybackIndicator(
    state.isPlaying,
    isDevBuildConflictActive(devBuildConflictState),
  );
}

function setConnectorPlaybackStateStreaming(enabled: boolean): void {
  void ytm
    .broadcast({ type: "set-connector-playback-state-streaming", enabled })
    .catch(() => undefined);
}

function isMissingNativeHostError(message: string): boolean {
  return /native messaging host.*not found|specified native messaging host not found|no such native application|native host.*not found|host not found|manifest.*not found|error when communicating with the native messaging host/i.test(
    message,
  );
}

function isNativeHostExitError(message: string | null): boolean {
  return /native host (has )?exited/i.test(message ?? "");
}

function nativeMessagingConnectionId(hostName: string): string {
  return `native:${hostName}`;
}

function defaultNativeHostDiagnostic(): NativeHostDiagnostic {
  return {
    availability: "unknown",
    lastError: null,
    lastCheckedAt: null,
  };
}

function nativeHostDiagnostic(connectorId: string): NativeHostDiagnostic {
  return (
    firstPartyNativeHostDiagnostics.get(connectorId) ??
    defaultNativeHostDiagnostic()
  );
}

function setNativeHostDiagnostic(
  connectorId: string,
  diagnostic: NativeHostDiagnostic,
): void {
  const next = new Map(firstPartyNativeHostDiagnostics);
  next.set(connectorId, diagnostic);
  firstPartyNativeHostDiagnostics = next;
}

function recordNativeHostAvailable(
  connectorId: string,
  shouldNotify = true,
): void {
  setNativeHostDiagnostic(connectorId, {
    availability: "available",
    lastError: null,
    lastCheckedAt: Date.now(),
  });
  if (shouldNotify) notifyConnectedAppsChanged();
}

function recordNativeHostError(connectorId: string, error: Error): void {
  const message = error.message || String(error);
  setNativeHostDiagnostic(connectorId, {
    availability: isMissingNativeHostError(message) ? "missing" : "error",
    lastError: message,
    lastCheckedAt: Date.now(),
  });
  notifyConnectedAppsChanged();
}

function firstPartyNativeHostTransports() {
  return FIRST_PARTY_CONNECTED_APP_DEFINITIONS.map((definition) =>
    createNativeMessagingTransport({
      hostName: definition.nativeHostName,
      connectionId: nativeMessagingConnectionId(definition.nativeHostName),
      onConnect: () => recordNativeHostAvailable(definition.id),
      onDisconnect: () => {
        connectorHost?.disconnect(
          nativeMessagingConnectionId(definition.nativeHostName),
        );
      },
      onError: (err) => recordNativeHostError(definition.id, err),
    }),
  );
}

async function enableConnectorSupport(): Promise<void> {
  if (connectorHost !== null) return;

  connectorHost = createConnectorHost({
    enabled: true,
    ytm,
    isConnectorAllowed(manifest) {
      return knownConnectors.get(manifest.id)?.enabled !== false;
    },
    onConnectorSeen: rememberConnector,
    onPlaybackStateSubscriptionChanged: setConnectorPlaybackStateStreaming,
    transports: firstPartyNativeHostTransports(),
  });
  connectorHost.start();
}

async function startConnectorSupport(): Promise<void> {
  try {
    await enableConnectorSupport();
  } catch (err) {
    const startupError =
      err instanceof Error
        ? err
        : new Error(err == null ? "Unknown error" : String(err));
    error("Failed to start connector support:", startupError);
    for (const definition of FIRST_PARTY_CONNECTED_APP_DEFINITIONS) {
      recordNativeHostError(definition.id, startupError);
    }
    disableConnectorSupport();
  }
}

function disableConnectorSupport(): void {
  connectorHost?.setEnabled(false);
  connectorHost = null;
  setConnectorPlaybackStateStreaming(false);
}

function isConnectorSupportSuspendedForDevBuildConflict(): boolean {
  return !__DEV__ && isDevBuildConflictActive(devBuildConflictState);
}

async function startConnectorSupportIfAvailable(): Promise<void> {
  if (isConnectorSupportSuspendedForDevBuildConflict()) {
    disableConnectorSupport();
    return;
  }

  await startConnectorSupport();
}

async function syncConnectorSupportForDevBuildConflict(): Promise<void> {
  if (!connectorSupportEnabled) return;

  if (isConnectorSupportSuspendedForDevBuildConflict()) {
    disableConnectorSupport();
    return;
  }

  await startConnectorSupport();
}

async function restartConnectorSupport(): Promise<void> {
  if (!connectorSupportEnabled) return;

  disableConnectorSupport();
  await startConnectorSupportIfAvailable();
}

function shouldRecheckNativeHostAvailability(
  firstPartyApp: Pick<FirstPartyConnectedApp, "id">,
): boolean {
  const diagnostic = nativeHostDiagnostic(firstPartyApp.id);
  if (!connectorSupportEnabled) return false;
  if (diagnostic.availability === "available") return false;
  if (
    diagnostic.availability === "error" &&
    isNativeHostExitError(diagnostic.lastError)
  ) {
    return false;
  }
  if (
    diagnostic.lastCheckedAt !== null &&
    Date.now() - diagnostic.lastCheckedAt <
      FIRST_PARTY_NATIVE_HOST_RECHECK_COOLDOWN_MS
  ) {
    return false;
  }

  return (
    diagnostic.availability === "unknown" ||
    diagnostic.availability === "missing" ||
    diagnostic.availability === "error"
  );
}

async function recheckFirstPartyNativeHostAvailability(): Promise<void> {
  if (
    !FIRST_PARTY_CONNECTED_APP_DEFINITIONS.some(
      shouldRecheckNativeHostAvailability,
    )
  ) {
    return;
  }
  await restartConnectorSupport();
}

function connectedConnectorIds(): Set<string> {
  return new Set(
    connectorHost?.listSessions().map((session) => session.manifest.id) ?? [],
  );
}

function connectedAppsSettings() {
  return createConnectedAppsSettings(
    connectorSupportEnabled,
    knownConnectors,
    connectedConnectorIds(),
    Object.fromEntries(
      FIRST_PARTY_CONNECTED_APP_DEFINITIONS.map((definition) => [
        definition.id,
        nativeHostDiagnostic(definition.id),
      ]),
    ),
  );
}

async function saveKnownConnectors(): Promise<void> {
  await saveModuleStateValue(
    CONNECTORS_KNOWN_STATE_KEY,
    Array.from(knownConnectors.values()),
  );
}

function disconnectConnector(connectorId: string): void {
  for (const session of connectorHost?.listSessions() ?? []) {
    if (session.manifest.id === connectorId) {
      connectorHost?.disconnect(session.connectionId);
    }
  }
}

async function requestMenuBarUninstall(): Promise<boolean> {
  return (
    (await connectorHost?.requestUninstall(
      FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
    )) ?? false
  );
}

function rememberConnector(
  manifest: ConnectorManifest,
  status: ConnectorStatus,
): void {
  if (manifest.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID) {
    recordNativeHostAvailable(manifest.id, false);
  } else if (firstPartyConnectedAppDefinition(manifest.id)) {
    recordNativeHostAvailable(manifest.id, false);
  }
  knownConnectors = upsertKnownConnector(knownConnectors, manifest, {
    now: Date.now(),
    status,
  });
  void saveKnownConnectors().finally(notifyConnectedAppsChanged);
}

async function setConnectorSupportEnabled(enabled: boolean): Promise<void> {
  connectorSupportEnabled = enabled;
  await saveModuleStateValue(CONNECTORS_ENABLED_STATE_KEY, enabled);

  if (enabled) {
    await startConnectorSupportIfAvailable();
  } else {
    disableConnectorSupport();
  }

  notifyConnectedAppsChanged();
}

async function notifyDevBuildConflictStatusChanged(): Promise<void> {
  const duplicateDetected = isDevBuildConflictActive(devBuildConflictState);

  broadcastPopupMessage({ type: "dev-build-conflict-status-changed" });
  await setActionDevBuildConflictIndicator(duplicateDetected, __DEV__);
  setActionPlaybackIndicator(lastPlaybackStateIsPlaying, duplicateDetected);
  await syncConnectorSupportForDevBuildConflict();
}

async function updateDevBuildConflictState(
  update: () => void,
  forceNotify = false,
): Promise<void> {
  const wasDuplicateDisabled = isDevBuildConflictActive(devBuildConflictState);
  update();
  const isDuplicateDisabled = isDevBuildConflictActive(devBuildConflictState);
  if (forceNotify || isDuplicateDisabled !== wasDuplicateDisabled) {
    await notifyDevBuildConflictStatusChanged();
  }
}

async function setExternalDevBuildPresent(present: boolean): Promise<void> {
  await updateDevBuildConflictState(() => {
    devBuildConflictState.externalDevBuildPresent = present;
  });
}

async function markExternalDevBuildPresent(): Promise<void> {
  await setExternalDevBuildPresent(true);
  if (externalDevBuildStaleTimer !== null) {
    clearTimeout(externalDevBuildStaleTimer);
  }
  externalDevBuildStaleTimer = setTimeout(() => {
    externalDevBuildStaleTimer = null;
    void setExternalDevBuildPresent(false);
  }, DEV_BUILD_STALE_MS);
}

const devBuildPresenceCoordinator = createDevBuildPresenceCoordinator({
  isDevBuild: __DEV__,
  runtime: chrome.runtime,
  onDevPresent: markExternalDevBuildPresent,
  onForwardedHotkeyCommand: async (command) => {
    if (!hotkeyRegistry.has(command)) {
      throw new Error(`Unknown forwarded hotkey command: ${command}`);
    }
    debug("Hotkey: received forwarded command", command);
    await hotkeyRegistry.dispatch(command);
  },
});

function isAutoPlayMode(value: unknown): value is AutoPlayMode {
  return value === "default" || value === "off" || value === "on";
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

async function handleBrowserCommand(command: string): Promise<void> {
  if (!__DEV__) {
    await devBuildPresenceCoordinator.probeDevPresence();
    if (shouldForwardHotkeyToDevBuild(devBuildConflictState, __DEV__)) {
      const forwarded = await forwardHotkeyCommandToDevBuild(
        chrome.runtime,
        command,
      );
      if (forwarded) return;
    }
  }

  await hotkeyRegistry.dispatch(command);
}

registerModuleHotkeys(context, modules, hotkeyRegistry);
registerModuleAlarms(context, modules, alarmRegistry);
registerModuleNotificationClicks(context, modules, notificationClickRegistry);

// Chrome MV3 service workers require event listeners to be registered
// synchronously at the top level of the script, during the first turn
// of the event loop. Registering inside an async init() is too late.
chrome.commands.onCommand.addListener((command: string) => {
  void handleBrowserCommand(command);
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureYtmContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureYtmContentScripts();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void alarmRegistry.dispatch(alarm);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void notificationClickRegistry.dispatch(notificationId);
});

const handler = createMessageHandler();

handler.on("dev-build-liveness-check", async () => {
  return { ok: true };
});

handler.on("get-registered-hotkeys", async () => ({
  ok: true,
  data: hotkeyRegistry.listRegistrations(),
}));

handler.on("track-changed", async (message, sender) => {
  return handleTrackChangedMessage(message, sender, {
    isYTMTabSuppressed,
    miniPlayer,
    notifications,
    publishPlaybackState(state) {
      updatePlaybackStateIndicators(state);
    },
  });
});

handler.on("connector-playback-state-changed", async (message, sender) => {
  if (isYTMTabSuppressed(sender?.tab?.id)) return { ok: true };
  updatePlaybackStateIndicators(message.state as PlaybackState);
  return { ok: true };
});

handler.on("get-connector-playback-state-streaming", async () => {
  return {
    ok: true,
    data: connectorHost?.hasPlaybackStateSubscribers() === true,
  };
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

handler.on("content-runtime-dev-build-suspension", async (message, sender) => {
  const tabId = sender?.tab?.id;
  if (tabId === undefined) return { ok: false, error: "No tab ID" };

  await updateDevBuildConflictState(() => {
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

handler.on("get-connected-apps-settings", async () => {
  await recheckFirstPartyNativeHostAvailability();
  return { ok: true, data: connectedAppsSettings() };
});

handler.on("set-connected-apps-enabled", async (message) => {
  if (typeof message.enabled !== "boolean") {
    return { ok: false, error: "Invalid connector support enabled value" };
  }
  await setConnectorSupportEnabled(message.enabled);
  return { ok: true };
});

handler.on("set-connector-enabled", async (message) => {
  if (typeof message.connectorId !== "string") {
    return { ok: false, error: "Invalid connector ID" };
  }
  if (typeof message.enabled !== "boolean") {
    return { ok: false, error: "Invalid connector enabled value" };
  }

  const next = setKnownConnectorEnabled(
    knownConnectors,
    message.connectorId,
    message.enabled,
  );
  if (!next) return { ok: false, error: "Unknown connector" };

  knownConnectors = next;
  if (message.enabled) {
    await restartConnectorSupport();
  } else {
    disconnectConnector(message.connectorId);
  }
  await saveKnownConnectors();
  notifyConnectedAppsChanged();
  return { ok: true };
});

handler.on("request-menu-bar-uninstall", async () => {
  const requested = await requestMenuBarUninstall();
  if (!requested) {
    return {
      ok: false,
      error: "Open YTM Menu Bar before requesting uninstall.",
    };
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

handler.on("get-playback-state", async () => {
  return { ok: true, data: await ytm.getPlaybackState() };
});

handler.on("playback-action", async (message, sender) =>
  handlePlaybackActionMessage(message, sender, ytm),
);

handler.start();
devBuildPresenceCoordinator.registerExternalListener();
devBuildPresenceCoordinator.startDevHeartbeat();
void devBuildPresenceCoordinator.probeDevPresence();
void ensureYtmContentScripts();

chrome.tabs.onRemoved.addListener((tabId) => {
  context.events.emit("ytm-tab-reset", { tabId });
  void updateDevBuildConflictState(() => {
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
    context.events.emit("ytm-tab-reset", { tabId: _tabId });
    void updateDevBuildConflictState(() => {
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
  knownConnectors = new Map(
    normalizeKnownConnectors(state[CONNECTORS_KNOWN_STATE_KEY]).map(
      (connector) => [connector.id, connector],
    ),
  );
  connectorSupportEnabled = bool(CONNECTORS_ENABLED_STATE_KEY, false);
  if (connectorSupportEnabled) {
    await startConnectorSupportIfAvailable();
  }
  selectedTabId = parseSelectedTabId(state["tabs.selectedTabId"]);

  await sleepTimer.restore({
    endAt: num("sleep-timer.endAt"),
    lastPausedAt: num("sleep-timer.lastPausedAt"),
    notifyOnEnd: bool("sleep-timer.notifyOnEnd", true),
    mode: state["sleep-timer.mode"] === "absolute" ? "absolute" : "duration",
  });
}

registerModuleHandlers(context, modules, handler);

const modulesReady = Promise.all([
  restoreModuleState(),
  initializeModules(context, modules),
])
  .then(async () => {
    await syncModuleContentState(context, modules);
  })
  .catch((err) => {
    error("Failed to initialize modules:", err);
  });

handler.setReadyGate(() => modulesReady);

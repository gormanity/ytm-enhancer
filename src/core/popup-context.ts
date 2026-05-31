import { EventBus } from "./events";
import { PopupRegistry } from "./popup-registry";
import { detectCapabilities } from "./capabilities";
import { createShortcutCommandClient } from "./commands";
import { createAlarmSchedulerClient } from "./alarm-registry";
import { createNotificationClient } from "./notifications";
import { createRuntimeClient, type RuntimeClient } from "./messaging";
import type { ModuleContext, PlaybackAction, PlaybackState } from "./types";
import type {
  YtmRuntimeClient,
  YtmTabListState,
  YtmTarget,
} from "./ytm-client";

function getRuntimeManifestVersion(): string {
  if (
    typeof chrome === "undefined" ||
    typeof chrome.runtime?.getManifest !== "function"
  ) {
    return "0.0.0";
  }
  return chrome.runtime.getManifest().version;
}

function getRuntimeUrl(path: string): string {
  if (
    typeof chrome === "undefined" ||
    typeof chrome.runtime?.getURL !== "function"
  ) {
    return path;
  }
  return chrome.runtime.getURL(path);
}

function targetPayload(target?: YtmTarget): Record<string, unknown> {
  if (!target || target.kind === "selected") return {};
  if (target.kind === "tab") return { tabId: target.tabId };
  return {};
}

export function createPopupYtmRuntimeClient(
  runtime: RuntimeClient,
): YtmRuntimeClient {
  return {
    listTabs() {
      return runtime.request<YtmTabListState>({ type: "get-ytm-tabs" });
    },
    selectTab(tabId) {
      return runtime.command({ type: "set-selected-tab", tabId });
    },
    focusTab(tabId) {
      return runtime.command({ type: "focus-ytm-tab", tabId });
    },
    async getTabArtwork(tabId) {
      const data = await runtime.request<{ artworkUrl: string | null }>({
        type: "get-ytm-tab-artwork",
        tabId,
      });
      return data.artworkUrl;
    },
    getPlaybackState(target) {
      return runtime.request<PlaybackState>({
        type: "get-playback-state",
        ...targetPayload(target),
      });
    },
    executePlaybackAction(action: PlaybackAction, target) {
      return runtime.command({
        type: "playback-action",
        action,
        ...targetPayload(target),
      });
    },
    seekTo(time, target) {
      return runtime.command({
        type: "playback-action",
        action: "seekTo",
        time,
        ...targetPayload(target),
      });
    },
    getVolume() {
      return runtime.request<number>({ type: "get-volume" });
    },
    setVolume(volume) {
      return runtime.command({ type: "set-volume", volume });
    },
    getPlaybackSpeed() {
      return runtime.request<number>({ type: "get-playback-speed" });
    },
    setPlaybackSpeed(rate) {
      return runtime.command({ type: "set-playback-speed", rate });
    },
    getStreamQuality() {
      return runtime.request<string | null>({ type: "get-stream-quality" });
    },
    setStreamQuality(value) {
      return runtime.command({ type: "set-stream-quality", value });
    },
    broadcast(message) {
      return runtime.command({ type: "ytm-broadcast", message });
    },
  };
}

export function createPopupModuleContext(): ModuleContext {
  const runtime = createRuntimeClient();
  return {
    events: new EventBus(),
    popup: new PopupRegistry(),
    capabilities: detectCapabilities(),
    ytm: createPopupYtmRuntimeClient(runtime),
    runtime,
    state: { saveValue: async () => undefined },
    storage: {
      get(keys) {
        return chrome.storage.local.get(keys) as Promise<
          Record<string, unknown>
        >;
      },
      async set(items) {
        await chrome.storage.local.set(items);
      },
    },
    extension: {
      getVersion: getRuntimeManifestVersion,
      getUrl: getRuntimeUrl,
    },
    commands: createShortcutCommandClient(),
    alarms: createAlarmSchedulerClient(),
    notifications: createNotificationClient(),
    popupEvents: {
      broadcast: () => undefined,
    },
  };
}

import type { MessageResponse } from "./messaging";
import type { PlaybackAction, PlaybackState } from "./types";
import { findAllYTMTabs, findYTMTab } from "./tab-finder";
import { debug } from "./logger";

const CONNECTION_ERROR =
  "Could not establish connection. Receiving end does not exist.";
const DISABLED_ERROR = "Disabled while the dev build is active";
const NO_YTM_TAB_ERROR = "No YTM tab";
const TAB_ARTWORK_QUERY_TIMEOUT_MS = 150;

export interface YtmTabSummary {
  id: number | null;
  title: string;
  artworkUrl: string | null;
  isSelected: boolean;
}

export interface YtmTabListState {
  tabs: YtmTabSummary[];
  selectedTabId: number | null;
}

export type YtmTarget =
  | { kind: "selected" }
  | { kind: "any" }
  | { kind: "tab"; tabId: number };

export interface YtmRuntimeClient {
  listTabs(): Promise<YtmTabListState>;
  selectTab(tabId: number | null): Promise<void>;
  focusTab(tabId?: number | null): Promise<void>;
  getTabArtwork(tabId: number): Promise<string | null>;
  getPlaybackState(target?: YtmTarget): Promise<PlaybackState>;
  executePlaybackAction(
    action: PlaybackAction,
    target?: YtmTarget,
  ): Promise<void>;
  seekTo(time: number, target?: YtmTarget): Promise<void>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  getPlaybackSpeed(): Promise<number>;
  setPlaybackSpeed(rate: number): Promise<void>;
  getStreamQuality(): Promise<string | null>;
  setStreamQuality(quality: string): Promise<void>;
  broadcast(message: Record<string, unknown>): Promise<void>;
}

export interface YtmRuntimeClientOptions {
  getSelectedTabId: () => number | null;
  setSelectedTabId: (tabId: number | null) => void | Promise<void>;
  isTabSuppressed: (tabId: number | undefined) => boolean;
  onTabsChanged?: () => void;
  tabArtworkQueryTimeoutMs?: number;
}

interface TabSelectionCandidate {
  id?: number;
  active?: boolean;
}

function resolveSelectedTabId(
  tabs: TabSelectionCandidate[],
  selectedTabId: number | null,
): number | null {
  const exists =
    selectedTabId !== null && tabs.some((tab) => tab.id === selectedTabId);
  if (exists) return selectedTabId;

  const activeTab = tabs.find(
    (tab) => tab.active === true && tab.id !== undefined,
  );
  if (activeTab?.id !== undefined) return activeTab.id;

  const firstTab = tabs.find((tab) => tab.id !== undefined);
  if (firstTab?.id !== undefined) return firstTab.id;

  return null;
}

function assertOk(
  response: MessageResponse,
): asserts response is { ok: true; data?: unknown } {
  if (!response.ok) throw new Error(response.error);
}

export function createYtmRuntimeClient(
  options: YtmRuntimeClientOptions,
): YtmRuntimeClient {
  const timeoutMs =
    options.tabArtworkQueryTimeoutMs ?? TAB_ARTWORK_QUERY_TIMEOUT_MS;

  const setSelectedTabId = async (tabId: number | null): Promise<void> => {
    await options.setSelectedTabId(tabId);
  };

  const resolveTargetTab = async (
    target: YtmTarget = { kind: "selected" },
  ): Promise<chrome.tabs.Tab> => {
    if (target.kind === "tab") {
      const tab = await findYTMTab(target.tabId);
      if (!tab?.id) throw new Error(NO_YTM_TAB_ERROR);
      if (options.isTabSuppressed(tab.id)) throw new Error(DISABLED_ERROR);
      return tab;
    }

    const preferredTabId =
      target.kind === "selected" ? options.getSelectedTabId() : null;
    const tab = await findYTMTab(preferredTabId);
    if (!tab?.id) throw new Error(NO_YTM_TAB_ERROR);
    if (options.isTabSuppressed(tab.id)) throw new Error(DISABLED_ERROR);
    return tab;
  };

  const sendToTab = async <TData = unknown>(
    tabId: number,
    message: Record<string, unknown>,
  ): Promise<TData> => {
    try {
      const response = (await chrome.tabs.sendMessage(
        tabId,
        message,
      )) as MessageResponse;
      assertOk(response);
      return response.data as TData;
    } catch (error) {
      if (error instanceof Error && error.message === CONNECTION_ERROR) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        const response = (await chrome.tabs.sendMessage(
          tabId,
          message,
        )) as MessageResponse;
        assertOk(response);
        return response.data as TData;
      }
      throw error;
    }
  };

  const relayToTarget = async (
    message: Record<string, unknown>,
    target?: YtmTarget,
  ): Promise<void> => {
    const startedAt = performance.now();
    const tab = await resolveTargetTab(target);
    debug("YTMClient: relay start", {
      type: message.type,
      action: message.action,
      target: target ?? { kind: "selected" },
      tabId: tab.id ?? null,
    });

    try {
      await sendToTab(tab.id!, message);
      debug("YTMClient: relay completed", {
        type: message.type,
        action: message.action,
        tabId: tab.id ?? null,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      debug("YTMClient: relay failed", {
        type: message.type,
        action: message.action,
        tabId: tab.id ?? null,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  return {
    async listTabs(): Promise<YtmTabListState> {
      const tabs = await findAllYTMTabs();
      const currentSelectedTabId = options.getSelectedTabId();
      const selectedTabId = resolveSelectedTabId(tabs, currentSelectedTabId);
      if (selectedTabId !== currentSelectedTabId) {
        await setSelectedTabId(selectedTabId);
        options.onTabsChanged?.();
      }

      return {
        selectedTabId,
        tabs: tabs.map((tab) => ({
          id: tab.id ?? null,
          title: tab.title ?? "YouTube Music",
          artworkUrl: null,
          isSelected: tab.id === selectedTabId,
        })),
      };
    },

    async selectTab(tabId: number | null): Promise<void> {
      await setSelectedTabId(tabId);
      options.onTabsChanged?.();
    },

    async focusTab(tabId?: number | null): Promise<void> {
      const tab = await resolveTargetTab(
        typeof tabId === "number"
          ? { kind: "tab", tabId }
          : { kind: "selected" },
      );
      await chrome.tabs.update(tab.id!, { active: true });
      if (tab.windowId != null) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    },

    async getTabArtwork(tabId: number): Promise<string | null> {
      if (options.isTabSuppressed(tabId)) throw new Error(DISABLED_ERROR);
      try {
        const responsePromise = chrome.tabs.sendMessage(tabId, {
          type: "get-playback-state",
        }) as Promise<{ ok: boolean; data?: PlaybackState }>;
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), timeoutMs);
        });
        const response = await Promise.race([responsePromise, timeoutPromise]);
        if (response && typeof response === "object" && response.ok) {
          return response.data?.artworkUrl ?? null;
        }
        return null;
      } catch {
        return null;
      }
    },

    async getPlaybackState(target?: YtmTarget): Promise<PlaybackState> {
      const tab = await resolveTargetTab(target);
      return sendToTab<PlaybackState>(tab.id!, { type: "get-playback-state" });
    },

    async executePlaybackAction(
      action: PlaybackAction,
      target?: YtmTarget,
    ): Promise<void> {
      await relayToTarget({ type: "playback-action", action }, target);
    },

    async seekTo(time: number, target?: YtmTarget): Promise<void> {
      await relayToTarget(
        { type: "playback-action", action: "seekTo", time },
        target,
      );
    },

    async getVolume(): Promise<number> {
      const tab = await resolveTargetTab();
      return sendToTab<number>(tab.id!, { type: "get-volume" });
    },

    async setVolume(volume: number): Promise<void> {
      await relayToTarget({ type: "set-volume", volume });
    },

    async getPlaybackSpeed(): Promise<number> {
      const tab = await resolveTargetTab();
      return sendToTab<number>(tab.id!, { type: "get-playback-speed" });
    },

    async setPlaybackSpeed(rate: number): Promise<void> {
      await relayToTarget({ type: "set-playback-speed", rate });
    },

    async getStreamQuality(): Promise<string | null> {
      const tab = await resolveTargetTab();
      return sendToTab<string | null>(tab.id!, { type: "get-stream-quality" });
    },

    async setStreamQuality(quality: string): Promise<void> {
      await relayToTarget({ type: "set-stream-quality", value: quality });
    },

    async broadcast(message: Record<string, unknown>): Promise<void> {
      const tabs = await findAllYTMTabs();
      await Promise.all(
        tabs.map(async (tab) => {
          if (tab.id === undefined || options.isTabSuppressed(tab.id)) return;
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch {
            // Tab may not have a content script yet; broadcasting is best-effort.
          }
        }),
      );
    },
  };
}

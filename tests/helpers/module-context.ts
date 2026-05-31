import { vi } from "vitest";
import type { Capabilities } from "@/core/capabilities";
import { createShortcutCommandClient } from "@/core/commands";
import { EventBus } from "@/core/events";
import type { Message, MessageResponse, RuntimeClient } from "@/core/messaging";
import type { ModuleContext } from "@/core/types";
import type { YtmRuntimeClient } from "@/core/ytm-client";

type TestModuleContextOverrides = Partial<
  Omit<ModuleContext, "capabilities" | "ytm">
> & {
  capabilities?: Partial<Capabilities>;
  ytm?: Partial<YtmRuntimeClient>;
};

function createCallbackRuntimeClient(): RuntimeClient {
  return {
    request<TData = unknown>(message: Message): Promise<TData> {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response: MessageResponse) => {
          if (!response?.ok) {
            reject(new Error(response?.error ?? "Runtime request failed"));
            return;
          }
          resolve(response.data as TData);
        });
      });
    },

    command(message: Message): Promise<void> {
      const maybePromise = chrome.runtime.sendMessage(message);
      if (maybePromise && typeof maybePromise.then === "function") {
        return maybePromise.then((response?: MessageResponse) => {
          if (response && !response.ok) throw new Error(response.error);
        });
      }
      return Promise.resolve();
    },

    subscribe(listener) {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
  };
}

export function createMockYtmRuntimeClient(
  overrides: Partial<YtmRuntimeClient> = {},
): YtmRuntimeClient {
  return {
    listTabs: vi.fn().mockResolvedValue({ tabs: [], selectedTabId: null }),
    selectTab: vi.fn().mockResolvedValue(undefined),
    focusTab: vi.fn().mockResolvedValue(undefined),
    getTabArtwork: vi.fn().mockResolvedValue(null),
    getPlaybackState: vi.fn().mockResolvedValue({
      title: null,
      artist: null,
      album: null,
      year: null,
      artworkUrl: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
    }),
    executePlaybackAction: vi.fn().mockResolvedValue(undefined),
    seekTo: vi.fn().mockResolvedValue(undefined),
    getVolume: vi.fn().mockResolvedValue(0.5),
    setVolume: vi.fn().mockResolvedValue(undefined),
    getPlaybackSpeed: vi.fn().mockResolvedValue(1),
    setPlaybackSpeed: vi.fn().mockResolvedValue(undefined),
    getStreamQuality: vi.fn().mockResolvedValue("2"),
    setStreamQuality: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createTestModuleContext(
  overrides: TestModuleContextOverrides = {},
): ModuleContext {
  const {
    capabilities: capabilityOverrides,
    ytm: ytmOverrides,
    runtime: runtimeOverride,
    ...contextOverrides
  } = overrides;
  const capabilities: Capabilities = {
    runtime: "chrome",
    notifications: true,
    commands: false,
    storageLocal: true,
    storageSync: true,
    documentPip: true,
    ...capabilityOverrides,
  };

  const runtime = runtimeOverride ?? createCallbackRuntimeClient();

  return {
    events: new EventBus(),
    popup: {} as ModuleContext["popup"],
    state: { saveValue: vi.fn().mockResolvedValue(undefined) },
    storage: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    extension: {
      getVersion: vi.fn(() => "0.0.0"),
      getUrl: vi.fn((path: string) => `chrome-extension://fake-id/${path}`),
    },
    commands: createShortcutCommandClient(),
    alarms: {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
    },
    popupEvents: { broadcast: vi.fn() },
    ...contextOverrides,
    capabilities,
    ytm: createMockYtmRuntimeClient(ytmOverrides),
    runtime,
  };
}

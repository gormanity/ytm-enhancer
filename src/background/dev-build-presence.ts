import {
  CHROMIUM_LOCAL_DEV_EXTENSION_ID,
  CHROMIUM_PROD_EXTENSION_IDS,
  DEV_BUILD_PING_INTERVAL_MS,
  DEV_BUILD_PRESENCE_MESSAGE,
  DEV_BUILD_PRESENCE_REQUEST_MESSAGE,
  isDevBuildPresenceMessage,
  isDevBuildPresenceRequestMessage,
} from "@/runtime-messages";

type SendResponse = (response?: unknown) => void;

interface RuntimeExternalMessageEvent {
  addListener(
    listener: (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: SendResponse,
    ) => boolean | void,
  ): void;
}

export interface DevBuildPresenceRuntime {
  lastError?: chrome.runtime.LastError;
  sendMessage(
    extensionId: string,
    message: unknown,
    callback?: (response?: unknown) => void,
  ): void;
  onMessageExternal: RuntimeExternalMessageEvent;
}

export interface DevBuildPresenceCoordinatorOptions {
  isDevBuild: boolean;
  runtime: DevBuildPresenceRuntime;
  onDevPresent: () => void | Promise<void>;
  heartbeatMs?: number;
}

export interface DevBuildPresenceCoordinator {
  startDevHeartbeat: () => void;
  probeDevPresence: () => Promise<void>;
  registerExternalListener: () => void;
}

export function createDevBuildPresenceCoordinator({
  isDevBuild,
  runtime,
  onDevPresent,
  heartbeatMs = DEV_BUILD_PING_INTERVAL_MS,
}: DevBuildPresenceCoordinatorOptions): DevBuildPresenceCoordinator {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let externalListenerRegistered = false;

  const pingProdBuilds = (): void => {
    for (const extensionId of CHROMIUM_PROD_EXTENSION_IDS) {
      runtime.sendMessage(
        extensionId,
        { type: DEV_BUILD_PRESENCE_MESSAGE },
        () => {
          void runtime.lastError;
        },
      );
    }
  };

  const isPromiseLike = (value: unknown): value is PromiseLike<void> =>
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function";

  return {
    startDevHeartbeat(): void {
      if (!isDevBuild || heartbeatTimer !== null) return;
      pingProdBuilds();
      heartbeatTimer = setInterval(pingProdBuilds, heartbeatMs);
    },

    probeDevPresence(): Promise<void> {
      if (isDevBuild) return Promise.resolve();

      return new Promise((resolve) => {
        runtime.sendMessage(
          CHROMIUM_LOCAL_DEV_EXTENSION_ID,
          { type: DEV_BUILD_PRESENCE_REQUEST_MESSAGE },
          (response?: unknown) => {
            const presenceResponse = response as { ok?: boolean } | undefined;
            if (runtime.lastError || presenceResponse?.ok !== true) {
              resolve();
              return;
            }

            try {
              Promise.resolve(onDevPresent()).then(resolve, resolve);
            } catch {
              resolve();
            }
          },
        );
      });
    },

    registerExternalListener(): void {
      if (externalListenerRegistered) return;
      externalListenerRegistered = true;

      runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
        if (isDevBuild) {
          if (
            !CHROMIUM_PROD_EXTENSION_IDS.some(
              (extensionId) => extensionId === sender.id,
            )
          ) {
            return false;
          }
          if (!isDevBuildPresenceRequestMessage(message)) return false;

          sendResponse({ ok: true });
          return false;
        }

        if (sender.id !== CHROMIUM_LOCAL_DEV_EXTENSION_ID) return false;
        if (!isDevBuildPresenceMessage(message)) return false;

        let result: void | Promise<void>;
        try {
          result = onDevPresent();
        } catch {
          sendResponse({ ok: false });
          return false;
        }

        if (isPromiseLike(result)) {
          result.then(
            () => {
              sendResponse({ ok: true });
            },
            () => {
              sendResponse({ ok: false });
            },
          );
          return true;
        }

        sendResponse({ ok: true });
        return false;
      });
    },
  };
}

const DEV_BUILD_PRESENCE_TYPE = "ytm-enhancer:dev-build-presence";
const DEV_BUILD_HEARTBEAT_MS = 1000;
const PROD_INITIAL_GRACE_MS = 500;
const DEV_BUILD_STALE_MS = 3500;
const DEV_BUILD_LIVENESS_TIMEOUT_MS = 500;

type ExtensionContextActiveCheck = (
  callback: (active: boolean) => void,
) => void;

interface DevBuildRuntimeCoordinatorOptions {
  isDevBuild: boolean;
  onResume: () => void;
  onSuspend: () => void;
  isExtensionContextActive?: ExtensionContextActiveCheck;
  heartbeatMs?: number;
  initialGraceMs?: number;
  staleMs?: number;
}

interface DevBuildPresenceMessage {
  type: typeof DEV_BUILD_PRESENCE_TYPE;
  source: "ytm-enhancer";
  build: "dev";
}

function isDevBuildPresenceMessage(
  value: unknown,
): value is DevBuildPresenceMessage {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<DevBuildPresenceMessage>;
  return (
    data.type === DEV_BUILD_PRESENCE_TYPE &&
    data.source === "ytm-enhancer" &&
    data.build === "dev"
  );
}

function hasActiveExtensionContext(callback: (active: boolean) => void): void {
  try {
    if (typeof chrome === "undefined") {
      callback(true);
      return;
    }
    if (!chrome.runtime || typeof chrome.runtime.sendMessage !== "function") {
      callback(false);
      return;
    }

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      callback(false);
    }, DEV_BUILD_LIVENESS_TIMEOUT_MS);
    const finish = (active: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(active);
    };

    chrome.runtime.sendMessage(
      { type: "dev-build-liveness-check" },
      (response?: { ok?: boolean }) => {
        finish(!chrome.runtime.lastError && response?.ok === true);
      },
    );
  } catch {
    callback(false);
  }
}

export function createDevBuildRuntimeCoordinator({
  isDevBuild,
  onResume,
  onSuspend,
  isExtensionContextActive = hasActiveExtensionContext,
  heartbeatMs = DEV_BUILD_HEARTBEAT_MS,
  initialGraceMs = PROD_INITIAL_GRACE_MS,
  staleMs = DEV_BUILD_STALE_MS,
}: DevBuildRuntimeCoordinatorOptions): { start: () => () => void } {
  return {
    start() {
      if (isDevBuild) {
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        let stopped = false;
        const stopDevRuntime = () => {
          if (stopped) return;
          stopped = true;
          if (heartbeat !== null) {
            clearInterval(heartbeat);
            heartbeat = null;
          }
          onSuspend();
        };
        const announce = () => {
          isExtensionContextActive((active) => {
            if (stopped) return;
            if (!active) {
              stopDevRuntime();
              return;
            }
            window.postMessage(
              {
                type: DEV_BUILD_PRESENCE_TYPE,
                source: "ytm-enhancer",
                build: "dev",
              } satisfies DevBuildPresenceMessage,
              "*",
            );
          });
        };

        onResume();
        announce();
        if (!stopped) {
          heartbeat = setInterval(announce, heartbeatMs);
        }
        return stopDevRuntime;
      }

      let runtimeActive = false;
      let suspendedByDevBuild = false;
      let lastDevSeenAt: number | null = null;
      let initialGraceTimer: ReturnType<typeof setTimeout> | null = null;

      const resumeIfNoDevBuild = () => {
        if (runtimeActive || lastDevSeenAt !== null) return;
        runtimeActive = true;
        onResume();
      };

      const suspendForDevBuild = () => {
        if (!runtimeActive) return;
        runtimeActive = false;
        onSuspend();
      };

      const checkForStaleDevBuild = () => {
        if (runtimeActive || lastDevSeenAt === null) return;
        if (Date.now() - lastDevSeenAt < staleMs) return;
        lastDevSeenAt = null;
        suspendedByDevBuild = false;
        runtimeActive = true;
        onResume();
      };

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (!isDevBuildPresenceMessage(event.data)) return;

        lastDevSeenAt = Date.now();
        if (!suspendedByDevBuild) {
          suspendedByDevBuild = true;
          if (!runtimeActive) {
            onSuspend();
            return;
          }
        }
        suspendForDevBuild();
      };

      window.addEventListener("message", onMessage);
      initialGraceTimer = setTimeout(resumeIfNoDevBuild, initialGraceMs);
      const staleCheckTimer = setInterval(checkForStaleDevBuild, heartbeatMs);

      return () => {
        window.removeEventListener("message", onMessage);
        if (initialGraceTimer !== null) {
          clearTimeout(initialGraceTimer);
        }
        clearInterval(staleCheckTimer);
        if (runtimeActive) {
          runtimeActive = false;
          onSuspend();
        }
      };
    },
  };
}

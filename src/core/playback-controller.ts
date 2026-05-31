import type { PlaybackAction, PlaybackState } from "./types";
import type { YtmRuntimeClient } from "./ytm-client";

export type PlaybackControllerSnapshot =
  | { ok: true; data: PlaybackState }
  | { ok: false; error: string };

export type PlaybackControllerListener = (
  snapshot: PlaybackControllerSnapshot,
) => void;

export interface PlaybackControlDriver {
  getPlaybackState(): PlaybackState | Promise<PlaybackState>;
  executePlaybackAction(action: PlaybackAction): void | Promise<void>;
  seekTo(time: number): void | Promise<void>;
  subscribeToStateChanges?(listener: () => void): () => void;
}

export interface PlaybackControllerOptions {
  pollIntervalMs?: number;
  delayedRefreshMs?: number;
}

export interface PlaybackController {
  getState(): Promise<PlaybackState>;
  refresh(): Promise<PlaybackControllerSnapshot>;
  refreshAfterMutation(): void;
  executeAction(action: PlaybackAction): Promise<void>;
  seekTo(time: number): Promise<void>;
  subscribe(listener: PlaybackControllerListener): () => void;
  start(): void;
  stop(): void;
  destroy(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_DELAYED_REFRESH_MS = 150;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as Promise<T>).then === "function"
  );
}

export function createPlaybackController(
  driver: PlaybackControlDriver,
  options: PlaybackControllerOptions = {},
): PlaybackController {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const delayedRefreshMs =
    options.delayedRefreshMs ?? DEFAULT_DELAYED_REFRESH_MS;
  const listeners = new Set<PlaybackControllerListener>();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let delayedRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeStateChanges: (() => void) | null = null;

  const emit = (snapshot: PlaybackControllerSnapshot) => {
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const clearDelayedRefresh = () => {
    if (delayedRefreshTimer === null) return;
    clearTimeout(delayedRefreshTimer);
    delayedRefreshTimer = null;
  };

  const controller: PlaybackController = {
    async getState() {
      return await driver.getPlaybackState();
    },

    refresh() {
      try {
        const result = driver.getPlaybackState();
        if (isPromiseLike(result)) {
          return result
            .then((data) => {
              const snapshot: PlaybackControllerSnapshot = { ok: true, data };
              emit(snapshot);
              return snapshot;
            })
            .catch((err: unknown) => {
              const snapshot: PlaybackControllerSnapshot = {
                ok: false,
                error: errorMessage(err),
              };
              emit(snapshot);
              return snapshot;
            });
        }

        const snapshot: PlaybackControllerSnapshot = { ok: true, data: result };
        emit(snapshot);
        return Promise.resolve(snapshot);
      } catch (err) {
        const snapshot: PlaybackControllerSnapshot = {
          ok: false,
          error: errorMessage(err),
        };
        emit(snapshot);
        return Promise.resolve(snapshot);
      }
    },

    refreshAfterMutation() {
      void controller.refresh();
      clearDelayedRefresh();
      delayedRefreshTimer = setTimeout(() => {
        delayedRefreshTimer = null;
        void controller.refresh();
      }, delayedRefreshMs);
    },

    async executeAction(action) {
      try {
        await driver.executePlaybackAction(action);
      } finally {
        controller.refreshAfterMutation();
      }
    },

    async seekTo(time) {
      try {
        await driver.seekTo(time);
      } finally {
        controller.refreshAfterMutation();
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start() {
      if (pollTimer !== null) return;
      unsubscribeStateChanges =
        driver.subscribeToStateChanges?.(() => {
          void controller.refresh();
        }) ?? null;
      void controller.refresh();
      if (pollIntervalMs > 0) {
        pollTimer = setInterval(() => {
          void controller.refresh();
        }, pollIntervalMs);
      }
    },

    stop() {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      clearDelayedRefresh();
      unsubscribeStateChanges?.();
      unsubscribeStateChanges = null;
    },

    destroy() {
      controller.stop();
      listeners.clear();
    },
  };

  return controller;
}

export function createYtmPlaybackDriver(
  ytm: YtmRuntimeClient,
): PlaybackControlDriver {
  return {
    getPlaybackState: () => ytm.getPlaybackState(),
    executePlaybackAction: (action) => ytm.executePlaybackAction(action),
    seekTo: (time) => ytm.seekTo(time),
  };
}

import type { RuntimeClient } from "@/core/messaging";
import type { SleepTimerState } from "./index";

export type SleepTimerMode = "duration" | "absolute";
export type { SleepTimerState };

export interface SleepTimerClient {
  getState(): Promise<SleepTimerState>;
  start(durationMs: number): Promise<void>;
  cancel(): Promise<void>;
  getNotifyOnEnd(): Promise<boolean>;
  setNotifyOnEnd(enabled: boolean): Promise<void>;
  getMode(): Promise<SleepTimerMode>;
  setMode(mode: SleepTimerMode): Promise<void>;
  subscribeStateChanged(listener: () => void): () => void;
}

function normalizeMode(mode: unknown): SleepTimerMode {
  return mode === "absolute" ? "absolute" : "duration";
}

export function createSleepTimerClient(
  runtime: RuntimeClient,
): SleepTimerClient {
  return {
    getState: () =>
      runtime.request<SleepTimerState>({ type: "get-sleep-timer-state" }),
    start: (durationMs) =>
      runtime.command({ type: "start-sleep-timer", durationMs }),
    cancel: () => runtime.command({ type: "cancel-sleep-timer" }),
    getNotifyOnEnd: () =>
      runtime.request<boolean>({
        type: "get-sleep-timer-notify-enabled",
      }),
    setNotifyOnEnd: (enabled) =>
      runtime.command({
        type: "set-sleep-timer-notify-enabled",
        enabled,
      }),
    async getMode(): Promise<SleepTimerMode> {
      return normalizeMode(
        await runtime.request<SleepTimerMode>({
          type: "get-sleep-timer-mode",
        }),
      );
    },
    setMode: (mode) =>
      runtime.command({ type: "set-sleep-timer-mode", mode }),
    subscribeStateChanged(listener) {
      return runtime.subscribe((message: { type?: string }) => {
        if (message.type === "sleep-timer-state-changed") {
          listener();
        }
      });
    },
  };
}

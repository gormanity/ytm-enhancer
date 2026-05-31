import type { RuntimeClient } from "@/core/messaging";
import type { AutoPlayMode } from "@/core/types";

export interface AutoPlayStatus {
  browserAutoplayBlocked?: boolean;
}

export interface AutoPlayClient {
  getMode(): Promise<AutoPlayMode>;
  setMode(mode: AutoPlayMode): Promise<void>;
  getStatus(): Promise<AutoPlayStatus>;
  subscribeStatusChanged(listener: () => void): () => void;
}

function normalizeMode(mode: unknown): AutoPlayMode {
  return mode === "default" || mode === "off" || mode === "on"
    ? mode
    : "default";
}

export function createAutoPlayClient(runtime: RuntimeClient): AutoPlayClient {
  return {
    async getMode(): Promise<AutoPlayMode> {
      return normalizeMode(
        await runtime.request<AutoPlayMode>({
          type: "get-auto-play-mode",
        }),
      );
    },

    setMode: (mode) =>
      runtime.command({
        type: "set-auto-play-mode",
        mode: normalizeMode(mode),
      }),

    getStatus: () =>
      runtime.request<AutoPlayStatus>({
        type: "get-auto-play-status",
      }),

    subscribeStatusChanged(listener) {
      return runtime.subscribe((message: { type?: string }) => {
        if (message.type === "auto-play-status-changed") {
          listener();
        }
      });
    },
  };
}

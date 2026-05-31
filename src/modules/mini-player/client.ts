import type { RuntimeClient } from "@/core/messaging";

export interface MiniPlayerClient {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
  getSuppressNotifications(): Promise<boolean>;
  setSuppressNotifications(enabled: boolean): Promise<void>;
}

export function createMiniPlayerClient(
  runtime: RuntimeClient,
): MiniPlayerClient {
  return {
    isEnabled: () =>
      runtime.request<boolean>({
        type: "get-mini-player-enabled",
      }),
    setEnabled: (enabled) =>
      runtime.command({
        type: "set-mini-player-enabled",
        enabled,
      }),
    getSuppressNotifications: () =>
      runtime.request<boolean>({
        type: "get-mini-player-suppress-notifications",
      }),
    setSuppressNotifications: (enabled) =>
      runtime.command({
        type: "set-mini-player-suppress-notifications",
        enabled,
      }),
  };
}

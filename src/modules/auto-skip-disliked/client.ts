import type { RuntimeClient } from "@/core/messaging";

export interface AutoSkipDislikedClient {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

export function createAutoSkipDislikedClient(
  runtime: RuntimeClient,
): AutoSkipDislikedClient {
  return {
    isEnabled: () =>
      runtime.request<boolean>({
        type: "get-auto-skip-disliked-enabled",
      }),
    setEnabled: (enabled) =>
      runtime.command({
        type: "set-auto-skip-disliked-enabled",
        enabled,
      }),
  };
}

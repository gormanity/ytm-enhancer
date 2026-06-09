import type { RuntimeClient } from "../messaging";
import type { ConnectedAppsSettings } from "./settings";

export type { ConnectedApp, ConnectedAppsSettings } from "./settings";

export interface ConnectedAppsClient {
  getSettings(): Promise<ConnectedAppsSettings>;
  setGlobalEnabled(enabled: boolean): Promise<void>;
  setConnectorEnabled(id: string, enabled: boolean): Promise<void>;
  forgetConnector(id: string): Promise<void>;
  subscribeChanged(listener: () => void): () => void;
}

export function createConnectedAppsClient(
  runtime: RuntimeClient,
): ConnectedAppsClient {
  return {
    getSettings() {
      return runtime.request<ConnectedAppsSettings>({
        type: "get-connected-apps-settings",
      });
    },

    setGlobalEnabled(enabled) {
      return runtime.command({
        type: "set-connected-apps-enabled",
        enabled,
      });
    },

    setConnectorEnabled(id, enabled) {
      return runtime.command({
        type: "set-connector-enabled",
        connectorId: id,
        enabled,
      });
    },

    forgetConnector(id) {
      return runtime.command({
        type: "forget-connector",
        connectorId: id,
      });
    },

    subscribeChanged(listener) {
      return runtime.subscribe((message: { type?: string }) => {
        if (message.type === "connected-apps-state-changed") {
          listener();
        }
      });
    },
  };
}

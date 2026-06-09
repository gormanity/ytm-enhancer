import type { ConnectorPermission } from "@ytm-enhancer/connector-protocol";
import { bindModuleToggle } from "@/popup/module-ui";
import { renderPopupTemplate } from "@/popup/template";
import type { ModuleContext, PopupView } from "../types";
import {
  createConnectedAppsClient,
  type ConnectedAppsClient,
  type ConnectedAppsSettings,
} from "./client";
import {
  CONNECTOR_PERMISSION_LABELS,
  type ConnectedApp,
  type ConnectorStatus,
} from "./settings";
import templateHtml from "./popup.html?raw";

export type { ConnectedAppsClient, ConnectedAppsSettings } from "./client";

const STATUS_LABELS: Record<ConnectorStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  blocked: "Blocked",
  incompatible: "Incompatible",
};

function permissionLabel(permission: ConnectorPermission): string {
  return CONNECTOR_PERMISSION_LABELS[permission] ?? permission;
}

function setStatus(element: HTMLElement, status: ConnectorStatus): void {
  element.classList.remove(
    "connected-app-status-connected",
    "connected-app-status-blocked",
    "connected-app-status-incompatible",
  );

  if (status === "connected") {
    element.classList.add("connected-app-status-connected");
  }
  if (status === "blocked") {
    element.classList.add("connected-app-status-blocked");
  }
  if (status === "incompatible") {
    element.classList.add("connected-app-status-incompatible");
  }

  element.textContent = STATUS_LABELS[status];
}

function renderPermissionList(
  list: HTMLElement,
  connector: ConnectedApp,
): void {
  const items: HTMLElement[] = [];
  for (const permission of connector.permissions) {
    const item = document.createElement("li");
    item.textContent = permissionLabel(permission);
    items.push(item);
  }
  list.replaceChildren(...items);
}

function queryRole<TElement extends HTMLElement>(
  container: HTMLElement,
  role: string,
): TElement | null {
  return container.querySelector<TElement>(`[data-role="${role}"]`);
}

function createConnectorCard(
  template: HTMLTemplateElement,
  connector: ConnectedApp,
  client: ConnectedAppsClient,
  refresh: () => void,
): HTMLElement | null {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const card = fragment.firstElementChild as HTMLElement | null;
  if (!card) return null;

  card.dataset.connectorId = connector.id;

  const title = queryRole(card, "connected-app-name");
  if (title) title.textContent = connector.name;

  const version = queryRole(card, "connected-app-version");
  if (version) {
    version.textContent = `Version ${connector.version} - Protocol ${connector.protocolVersion}`;
  }

  const headerStatus = queryRole(card, "connected-app-header-status");
  if (headerStatus) setStatus(headerStatus, connector.status);

  const status = queryRole(card, "connected-app-status");
  if (status) setStatus(status, connector.status);

  const permissions = queryRole(card, "connected-app-permissions");
  if (permissions) renderPermissionList(permissions, connector);

  const enabledToggle = queryRole<HTMLInputElement>(
    card,
    "connected-app-enabled-toggle",
  );
  if (!enabledToggle) return card;
  enabledToggle.dataset.connectorId = connector.id;
  enabledToggle.checked = connector.enabled;
  enabledToggle.disabled = connector.status === "incompatible";
  enabledToggle.addEventListener("change", () => {
    void client
      .setConnectorEnabled(connector.id, enabledToggle.checked)
      .then(refresh)
      .catch(() => undefined);
  });

  const forgetButton = queryRole<HTMLButtonElement>(
    card,
    "connected-app-forget-button",
  );
  if (!forgetButton) return card;
  forgetButton.dataset.connectorId = connector.id;
  forgetButton.addEventListener("click", () => {
    forgetButton.disabled = true;
    void client
      .forgetConnector(connector.id)
      .then(refresh)
      .finally(() => {
        forgetButton.disabled = false;
      });
  });

  return card;
}

function renderConnectorList(
  container: HTMLElement,
  settings: ConnectedAppsSettings,
  client: ConnectedAppsClient,
  refresh: () => void,
): void {
  const list = container.querySelector<HTMLElement>(
    '[data-role="connected-apps-list"]',
  );
  const empty = container.querySelector<HTMLElement>(
    '[data-role="connected-apps-empty"]',
  );
  const template = container.querySelector<HTMLTemplateElement>(
    '[data-role="connected-app-template"]',
  );
  if (!list || !empty || !template) return;

  list.replaceChildren(
    ...settings.connectors.flatMap((connector) => {
      const card = createConnectorCard(template, connector, client, refresh);
      return card ? [card] : [];
    }),
  );
  empty.classList.toggle("is-hidden", settings.connectors.length > 0);
}

export function createConnectedAppsPopupView(
  context: ModuleContext,
  client: ConnectedAppsClient = createConnectedAppsClient(context.runtime),
): PopupView {
  return {
    id: "connected-apps",
    label: "Connected Apps",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const refresh = () => {
        void client
          .getSettings()
          .then((settings) => {
            renderConnectorList(container, settings, client, refresh);
          })
          .catch(() => undefined);
      };

      bindModuleToggle(container, "connected-apps-enabled-toggle", {
        get: async () => {
          const settings = await client.getSettings();
          renderConnectorList(container, settings, client, refresh);
          return settings.enabled;
        },
        set: async (enabled) => {
          await client.setGlobalEnabled(enabled);
          refresh();
        },
      });

      const unsubscribe = client.subscribeChanged(refresh);
      return unsubscribe;
    },
  };
}

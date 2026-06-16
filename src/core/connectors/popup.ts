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
  FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
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

const MENU_BAR_UPDATE_GUIDANCE =
  "Update required. Open About YTM Menu Bar to download the update, or run brew upgrade --cask ytm-menu-bar.";

function permissionLabel(permission: ConnectorPermission): string {
  return CONNECTOR_PERMISSION_LABELS[permission] ?? permission;
}

function setStatus(
  element: HTMLElement,
  status: ConnectorStatus,
  label = STATUS_LABELS[status],
): void {
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

  element.textContent = label;
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

  const updateGuidance = queryRole(card, "connected-app-update-guidance");
  if (
    updateGuidance &&
    connector.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID &&
    connector.status === "incompatible"
  ) {
    updateGuidance.textContent = MENU_BAR_UPDATE_GUIDANCE;
    updateGuidance.classList.remove("is-hidden");
  }

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

function firstPartyMenuBarConnector(
  settings: ConnectedAppsSettings,
): ConnectedApp | undefined {
  return settings.connectors.find(
    (connector) => connector.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
  );
}

function menuBarStatus(
  settings: ConnectedAppsSettings,
  connector: ConnectedApp | undefined,
): { status: ConnectorStatus; label: string } {
  if (connector?.status === "connected") {
    return { status: "connected", label: "Connected" };
  }
  if (connector?.status === "incompatible") {
    return { status: "incompatible", label: "Update Required" };
  }
  if (!settings.enabled && connector !== undefined) {
    return { status: "disconnected", label: "Off" };
  }
  if (connector?.status === "blocked") {
    return { status: "blocked", label: "Disabled" };
  }
  if (settings.menuBarApp.availability === "missing") {
    return { status: "blocked", label: "Not Installed" };
  }
  if (settings.menuBarApp.availability === "error") {
    return { status: "incompatible", label: "Needs Attention" };
  }
  if (connector !== undefined) {
    return { status: "disconnected", label: "Installed" };
  }
  if (settings.menuBarApp.availability === "available") {
    return { status: "disconnected", label: "Installed" };
  }
  return { status: "disconnected", label: "Available" };
}

function menuBarGuidance(
  settings: ConnectedAppsSettings,
  connector: ConnectedApp | undefined,
): string {
  if (connector?.status === "incompatible") {
    return MENU_BAR_UPDATE_GUIDANCE;
  }
  if (!settings.enabled && connector !== undefined) {
    return "Connected Apps is off, so YTM Menu Bar cannot connect.";
  }
  if (!settings.enabled) {
    return "Install YTM Menu Bar, then enable Connected Apps to allow it to connect.";
  }
  if (connector?.status === "blocked") {
    return "YTM Menu Bar is registered but disabled below.";
  }
  if (settings.menuBarApp.availability === "missing") {
    return "YTM Menu Bar or its native host was not detected. Reinstall it, or use Forget App below if you removed it.";
  }
  if (settings.menuBarApp.availability === "error") {
    return settings.menuBarApp.lastError
      ? `YTM Enhancer could not start YTM Menu Bar. Last error: ${settings.menuBarApp.lastError}`
      : "YTM Enhancer could not start YTM Menu Bar. Open or reinstall the app if this keeps happening.";
  }
  if (connector?.status === "connected") {
    return "YTM Menu Bar is connected and can control playback through YTM Enhancer.";
  }
  if (connector !== undefined) {
    return "Open YTM Menu Bar from Applications to connect. If you removed it, reinstall it or use Forget App below.";
  }
  return "Add playback info and controls to the macOS menu bar with the first YTM Enhancer connected app.";
}

function renderMenuBarAppCard(
  container: HTMLElement,
  settings: ConnectedAppsSettings,
): void {
  const appCard = container.querySelector<HTMLElement>(
    '[data-role="connected-app-menu-bar-card"]',
  );
  if (!appCard) return;

  const connector = firstPartyMenuBarConnector(settings);
  const badge = menuBarStatus(settings, connector);

  const status = queryRole(appCard, "connected-app-menu-bar-status");
  if (status) setStatus(status, badge.status, badge.label);

  const description = queryRole(appCard, "connected-app-menu-bar-description");
  if (description) description.textContent = settings.menuBarApp.description;

  const guidance = queryRole(appCard, "connected-app-menu-bar-guidance");
  if (guidance) guidance.textContent = menuBarGuidance(settings, connector);

  const directLink = queryRole<HTMLAnchorElement>(
    appCard,
    "connected-app-menu-bar-direct-link",
  );
  if (directLink) {
    directLink.href = settings.menuBarApp.installUrl;
    directLink.textContent =
      connector?.status === "incompatible"
        ? "Update YTM Menu Bar"
        : connector || settings.menuBarApp.availability !== "unknown"
          ? "Install or Reinstall"
          : "Download for macOS";
  }

  const homebrewCommand = queryRole<HTMLElement>(
    appCard,
    "connected-app-menu-bar-homebrew-command",
  );
  if (homebrewCommand) {
    homebrewCommand.textContent = settings.menuBarApp.homebrewCommand;
  }
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

  renderMenuBarAppCard(container, settings);

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

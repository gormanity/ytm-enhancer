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
  FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
  MENU_BAR_INSTALL_URL,
  type ConnectedApp,
  type ConnectedAppAvailability,
  type ConnectorStatus,
} from "./settings";
import templateHtml from "./popup.html?raw";

export type { ConnectedAppsClient, ConnectedAppsSettings } from "./client";

const STATUS_LABELS: Record<ConnectorStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  blocked: "Disabled",
  incompatible: "Incompatible",
};

const MENU_BAR_UPDATE_GUIDANCE =
  "Update required. Open About YTM Menu Bar to download the update, or run brew upgrade --cask ytm-menu-bar.";

const MENU_BAR_ACCESS: ConnectorPermission[] = [
  "playback:read",
  "track:read",
  "playback:control",
  "ytm:focus",
];

const CONNECTED_APP_ACCESS_LABELS: Record<ConnectorPermission, string> = {
  "playback:read": "Playback info and progress",
  "track:read": "Track details, artwork, and Up Next",
  "playback:control": "Playback controls",
  "ytm:focus": "Focus YouTube Music",
};

interface ConnectedAppCardModel {
  id: string;
  name: string;
  summary: string;
  status: ConnectorStatus;
  statusLabel: string;
  guidance: string;
  access: ConnectorPermission[];
  connector?: ConnectedApp;
  installUrl?: string;
  installLabel?: string;
  showUninstallInstructions?: boolean;
}

function isMenuBarInstalled(
  availability: ConnectedAppAvailability,
  connector: ConnectedApp | undefined,
): boolean {
  if (availability === "missing") return false;
  if (availability === "available") return true;
  if (availability === "error") return false;
  return connector !== undefined;
}

function isNativeHostExitError(settings: ConnectedAppsSettings): boolean {
  return /native host (has )?exited/i.test(settings.menuBarApp.lastError ?? "");
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

function renderAccessList(
  list: HTMLElement,
  permissions: ConnectorPermission[],
): void {
  const items: HTMLElement[] = [];
  for (const permission of permissions) {
    const item = document.createElement("li");
    item.textContent = CONNECTED_APP_ACCESS_LABELS[permission] ?? permission;
    items.push(item);
  }
  if (items.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No playback information is shared yet.";
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

function createConnectedAppCard(
  template: HTMLTemplateElement,
  app: ConnectedAppCardModel,
  client: ConnectedAppsClient,
  refresh: () => void,
  expandedAppIds: Set<string>,
): HTMLElement | null {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const card = fragment.firstElementChild as HTMLDetailsElement | null;
  if (!card) return null;

  card.dataset.appId = app.id;
  card.open = expandedAppIds.has(app.id);
  card.addEventListener("toggle", () => {
    if (card.open) {
      expandedAppIds.add(app.id);
    } else {
      expandedAppIds.delete(app.id);
    }
  });

  if (app.connector) {
    card.dataset.connectorId = app.connector.id;
  }

  const title = queryRole(card, "connected-app-name");
  if (title) title.textContent = app.name;

  const summary = queryRole(card, "connected-app-summary");
  if (summary) summary.textContent = app.summary;

  const status = queryRole(card, "connected-app-status");
  if (status) setStatus(status, app.status, app.statusLabel);

  const guidance = queryRole(card, "connected-app-guidance");
  if (guidance) guidance.textContent = app.guidance;

  const version = queryRole(card, "connected-app-version");
  if (version) {
    version.textContent = app.connector
      ? `Version ${app.connector.version} - Protocol ${app.connector.protocolVersion}`
      : "Not connected yet.";
  }

  const access = queryRole(card, "connected-app-shared-list");
  if (access) renderAccessList(access, app.access);

  const installLink = queryRole<HTMLAnchorElement>(
    card,
    "connected-app-install-link",
  );
  if (installLink && app.installUrl) {
    installLink.href = app.installUrl;
    installLink.textContent = app.installLabel ?? "Install";
    installLink.classList.remove("is-hidden");
  } else {
    installLink?.remove();
  }

  const uninstallButton = queryRole<HTMLButtonElement>(
    card,
    "connected-app-uninstall-button",
  );
  const uninstallInstructions = queryRole<HTMLElement>(
    card,
    "connected-app-uninstall-instructions",
  );
  if (
    uninstallButton &&
    uninstallInstructions &&
    app.showUninstallInstructions
  ) {
    uninstallButton.classList.remove("is-hidden");
    uninstallButton.addEventListener("click", () => {
      const isHidden = uninstallInstructions.classList.toggle("is-hidden");
      uninstallButton.setAttribute("aria-expanded", String(!isHidden));
    });
  } else {
    uninstallButton?.remove();
    uninstallInstructions?.remove();
  }

  const lifecycleButton = queryRole<HTMLButtonElement>(
    card,
    "connected-app-lifecycle-button",
  );
  if (lifecycleButton && app.connector) {
    lifecycleButton.dataset.connectorId = app.connector.id;
    lifecycleButton.textContent = app.connector.enabled
      ? "Disable App"
      : "Enable App";
    lifecycleButton.classList.remove("is-hidden");
    lifecycleButton.addEventListener("click", () => {
      lifecycleButton.disabled = true;
      void client
        .setConnectorEnabled(app.connector!.id, !app.connector!.enabled)
        .then(refresh)
        .finally(() => {
          lifecycleButton.disabled = false;
        });
    });
  } else {
    lifecycleButton?.remove();
  }

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
    if (isNativeHostExitError(settings)) {
      return { status: "disconnected", label: "Disconnected" };
    }
    return { status: "incompatible", label: "Needs Attention" };
  }
  if (connector?.status === "connected") {
    return { status: "connected", label: "Connected" };
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
    return "YTM Menu Bar is disabled. Enable it below when you want it to reconnect.";
  }
  if (settings.menuBarApp.availability === "missing") {
    return "YTM Menu Bar or its native host was not detected. Reinstall it from the button below if you want to use it again.";
  }
  if (settings.menuBarApp.availability === "error") {
    if (isNativeHostExitError(settings)) {
      return "YTM Menu Bar disconnected. Open it again if it is still installed, or download it again below.";
    }
    return settings.menuBarApp.lastError
      ? `YTM Enhancer could not start YTM Menu Bar. Last error: ${settings.menuBarApp.lastError}`
      : "YTM Enhancer could not start YTM Menu Bar. Open or reinstall the app if this keeps happening.";
  }
  if (connector?.status === "connected") {
    return "YTM Menu Bar is connected and can control playback through YTM Enhancer.";
  }
  if (connector !== undefined) {
    return "Open YTM Menu Bar from Applications to connect. If you removed it, reinstall it from the button below.";
  }
  return "Add playback info and controls to the macOS menu bar with the first YTM Enhancer connected app.";
}

function menuBarAction(
  settings: ConnectedAppsSettings,
  connector: ConnectedApp | undefined,
): { url?: string; label?: string; showUninstallInstructions?: boolean } {
  if (connector?.status === "incompatible") {
    return {
      url: settings.menuBarApp.installUrl || MENU_BAR_INSTALL_URL,
      label: "Update YTM Menu Bar",
    };
  }

  if (
    settings.menuBarApp.availability === "missing" ||
    settings.menuBarApp.availability === "error"
  ) {
    return {
      url: settings.menuBarApp.installUrl || MENU_BAR_INSTALL_URL,
      label: "Download for macOS",
    };
  }

  if (isMenuBarInstalled(settings.menuBarApp.availability, connector)) {
    return {
      showUninstallInstructions: true,
    };
  }

  return {
    url: settings.menuBarApp.installUrl || MENU_BAR_INSTALL_URL,
    label: "Download for macOS",
  };
}

function createMenuBarCardModel(
  settings: ConnectedAppsSettings,
): ConnectedAppCardModel {
  const connector = firstPartyMenuBarConnector(settings);
  const status = menuBarStatus(settings, connector);
  const action = menuBarAction(settings, connector);
  return {
    id: FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
    name: settings.menuBarApp.name,
    summary: settings.menuBarApp.description,
    status: status.status,
    statusLabel: status.label,
    guidance: menuBarGuidance(settings, connector),
    access: connector?.permissions ?? MENU_BAR_ACCESS,
    connector,
    installUrl: action.url,
    installLabel: action.label,
    showUninstallInstructions: action.showUninstallInstructions,
  };
}

function genericConnectorGuidance(connector: ConnectedApp): string {
  if (connector.status === "connected") {
    return "This app is connected through YTM Enhancer.";
  }
  if (connector.status === "blocked") {
    return "This app is disabled and cannot connect until it is enabled.";
  }
  if (connector.status === "incompatible") {
    return "This app uses an unsupported connector protocol.";
  }
  return "Open the app to reconnect it.";
}

function createGenericConnectorCardModel(
  connector: ConnectedApp,
): ConnectedAppCardModel {
  return {
    id: connector.id,
    name: connector.name,
    summary: "External app connected to YTM Enhancer.",
    status: connector.status,
    statusLabel: STATUS_LABELS[connector.status],
    guidance: genericConnectorGuidance(connector),
    access: connector.permissions,
    connector,
  };
}

function createConnectedAppCardModels(
  settings: ConnectedAppsSettings,
): ConnectedAppCardModel[] {
  return [
    createMenuBarCardModel(settings),
    ...settings.connectors
      .filter((connector) => connector.id !== FIRST_PARTY_MENU_BAR_CONNECTOR_ID)
      .map(createGenericConnectorCardModel),
  ];
}

function renderConnectedAppList(
  container: HTMLElement,
  settings: ConnectedAppsSettings,
  client: ConnectedAppsClient,
  refresh: () => void,
  expandedAppIds: Set<string>,
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

  const apps = createConnectedAppCardModels(settings);
  const visibleAppIds = new Set(apps.map((app) => app.id));
  for (const appId of expandedAppIds) {
    if (!visibleAppIds.has(appId)) expandedAppIds.delete(appId);
  }

  list.replaceChildren(
    ...apps.flatMap((app) => {
      const card = createConnectedAppCard(
        template,
        app,
        client,
        refresh,
        expandedAppIds,
      );
      return card ? [card] : [];
    }),
  );
  empty.classList.toggle("is-hidden", apps.length > 0);
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
      const expandedAppIds = new Set<string>();

      const refresh = () => {
        void client
          .getSettings()
          .then((settings) => {
            renderConnectedAppList(
              container,
              settings,
              client,
              refresh,
              expandedAppIds,
            );
          })
          .catch(() => undefined);
      };

      bindModuleToggle(container, "connected-apps-enabled-toggle", {
        get: async () => {
          const settings = await client.getSettings();
          renderConnectedAppList(
            container,
            settings,
            client,
            refresh,
            expandedAppIds,
          );
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

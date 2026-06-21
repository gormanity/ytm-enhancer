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
  type ConnectedApp,
  type ConnectedAppAvailability,
  type ConnectorStatus,
  type FirstPartyConnectedApp,
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
  showUninstallRequest?: boolean;
  showLifecycleControl?: boolean;
}

function isFirstPartyAppInstalled(
  availability: ConnectedAppAvailability,
): boolean {
  if (availability === "available") return true;
  return false;
}

function isNativeHostExitError(firstPartyApp: FirstPartyConnectedApp): boolean {
  return /native host (has )?exited/i.test(firstPartyApp.lastError ?? "");
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
  const uninstallStatus = queryRole<HTMLElement>(
    card,
    "connected-app-uninstall-status",
  );
  if (uninstallButton && uninstallStatus && app.showUninstallRequest) {
    uninstallButton.classList.remove("is-hidden");
    uninstallButton.addEventListener("click", () => {
      uninstallButton.disabled = true;
      uninstallButton.textContent = "Requesting...";
      uninstallStatus.classList.add("is-hidden");
      void client
        .requestMenuBarUninstall()
        .then(() => {
          uninstallStatus.textContent =
            "Check YTM Menu Bar to confirm uninstall.";
          uninstallStatus.classList.remove("is-hidden");
        })
        .catch((error: unknown) => {
          uninstallStatus.textContent =
            error instanceof Error
              ? error.message
              : "YTM Menu Bar could not be asked to uninstall.";
          uninstallStatus.classList.remove("is-hidden");
        })
        .finally(() => {
          uninstallButton.disabled = false;
          uninstallButton.textContent = "Uninstall App";
        });
    });
  } else {
    uninstallButton?.remove();
    uninstallStatus?.remove();
  }

  const lifecycleButton = queryRole<HTMLButtonElement>(
    card,
    "connected-app-lifecycle-button",
  );
  if (lifecycleButton && app.connector && app.showLifecycleControl !== false) {
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

function connectorForFirstPartyApp(
  settings: ConnectedAppsSettings,
  firstPartyApp: FirstPartyConnectedApp,
): ConnectedApp | undefined {
  return settings.connectors.find(
    (connector) => connector.id === firstPartyApp.id,
  );
}

function firstPartyAppStatus(
  settings: ConnectedAppsSettings,
  firstPartyApp: FirstPartyConnectedApp,
  connector: ConnectedApp | undefined,
): { status: ConnectorStatus; label: string } {
  if (connector?.status === "incompatible") {
    return {
      status: "incompatible",
      label:
        firstPartyApp.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID
          ? "Update Required"
          : "Incompatible",
    };
  }
  if (firstPartyApp.availability === "missing") {
    return { status: "blocked", label: "Not Installed" };
  }
  if (!settings.enabled && connector !== undefined) {
    return { status: "disconnected", label: "Off" };
  }
  if (
    connector?.status === "blocked" &&
    firstPartyApp.availability === "available"
  ) {
    return { status: "blocked", label: "Disabled" };
  }
  if (firstPartyApp.availability === "error") {
    if (isNativeHostExitError(firstPartyApp)) {
      return { status: "disconnected", label: "Disconnected" };
    }
    return { status: "incompatible", label: "Needs Attention" };
  }
  if (connector?.status === "connected") {
    return { status: "connected", label: "Connected" };
  }
  if (firstPartyApp.availability === "available") {
    return { status: "disconnected", label: "Installed" };
  }
  if (connector !== undefined) {
    return { status: "blocked", label: "Not Detected" };
  }
  return { status: "disconnected", label: "Available" };
}

function firstPartyAppGuidance(
  settings: ConnectedAppsSettings,
  firstPartyApp: FirstPartyConnectedApp,
  connector: ConnectedApp | undefined,
): string {
  if (connector?.status === "incompatible") {
    return firstPartyApp.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID
      ? MENU_BAR_UPDATE_GUIDANCE
      : `${firstPartyApp.name} uses an unsupported connector protocol. Install an updated version before using it.`;
  }
  if (firstPartyApp.availability === "missing") {
    return `${firstPartyApp.name} or its native host was not detected. Reinstall it from the button below if you want to use it again.`;
  }
  if (!settings.enabled && connector !== undefined) {
    return `Connected Apps is off, so ${firstPartyApp.name} cannot connect.`;
  }
  if (!settings.enabled) {
    return `Install ${firstPartyApp.name}, then enable Connected Apps to allow it to connect.`;
  }
  if (
    connector?.status === "blocked" &&
    firstPartyApp.availability === "available"
  ) {
    return `${firstPartyApp.name} is disabled. Enable it below when you want it to reconnect.`;
  }
  if (firstPartyApp.availability === "error") {
    if (isNativeHostExitError(firstPartyApp)) {
      return `${firstPartyApp.name} disconnected. Open it again if it is still installed, or download it again below.`;
    }
    return firstPartyApp.lastError
      ? `YTM Enhancer could not start ${firstPartyApp.name}. Last error: ${firstPartyApp.lastError}`
      : `YTM Enhancer could not start ${firstPartyApp.name}. Open or reinstall the app if this keeps happening.`;
  }
  if (connector?.status === "connected") {
    return `${firstPartyApp.name} is connected and can control playback through YTM Enhancer.`;
  }
  if (firstPartyApp.availability === "available") {
    if (firstPartyApp.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID) {
      return "Open YTM Menu Bar from Applications to connect.";
    }
    return "Run ytme doctor from your terminal to check the CLI connection.";
  }
  if (connector !== undefined) {
    return `${firstPartyApp.name} is not currently detected. Reinstall it if you removed it, or open it if it is installed.`;
  }
  if (firstPartyApp.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID) {
    return "Add playback info and controls to the macOS menu bar with the first YTM Enhancer connected app.";
  }
  return "Control YouTube Music from your terminal with ytme.";
}

function firstPartyAppAction(
  firstPartyApp: FirstPartyConnectedApp,
  connector: ConnectedApp | undefined,
): { url?: string; label?: string; showUninstallRequest?: boolean } {
  if (connector?.status === "incompatible") {
    return {
      url: firstPartyApp.installUrl,
      label:
        firstPartyApp.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID
          ? "Update YTM Menu Bar"
          : `Update ${firstPartyApp.name}`,
    };
  }

  if (
    firstPartyApp.availability === "missing" ||
    firstPartyApp.availability === "error"
  ) {
    return {
      url: firstPartyApp.installUrl,
      label: firstPartyApp.installLabel,
    };
  }

  if (
    firstPartyApp.supportsUninstallRequest &&
    isFirstPartyAppInstalled(firstPartyApp.availability)
  ) {
    return {
      showUninstallRequest: true,
    };
  }

  if (!isFirstPartyAppInstalled(firstPartyApp.availability)) {
    return {
      url: firstPartyApp.installUrl,
      label: firstPartyApp.installLabel,
    };
  }

  return {};
}

function createFirstPartyAppCardModel(
  settings: ConnectedAppsSettings,
  firstPartyApp: FirstPartyConnectedApp,
): ConnectedAppCardModel {
  const connector = connectorForFirstPartyApp(settings, firstPartyApp);
  const status = firstPartyAppStatus(settings, firstPartyApp, connector);
  const action = firstPartyAppAction(firstPartyApp, connector);
  return {
    id: firstPartyApp.id,
    name: firstPartyApp.name,
    summary: firstPartyApp.description,
    status: status.status,
    statusLabel: status.label,
    guidance: firstPartyAppGuidance(settings, firstPartyApp, connector),
    access: connector?.permissions ?? firstPartyApp.access,
    connector,
    installUrl: action.url,
    installLabel: action.label,
    showUninstallRequest: action.showUninstallRequest,
    showLifecycleControl:
      firstPartyApp.availability === "available" && connector !== undefined,
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
  const firstPartyIds = new Set(settings.firstPartyApps.map((app) => app.id));
  return [
    ...settings.firstPartyApps.map((app) =>
      createFirstPartyAppCardModel(settings, app),
    ),
    ...settings.connectors
      .filter((connector) => !firstPartyIds.has(connector.id))
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

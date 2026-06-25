import {
  CONNECTOR_PERMISSIONS,
  CONNECTOR_PROTOCOL_VERSION,
  type ConnectorManifest,
  type ConnectorPermission,
} from "@ytm-enhancer/connector-protocol";

export const CONNECTORS_ENABLED_STATE_KEY = "connectors.enabled";
export const CONNECTORS_KNOWN_STATE_KEY = "connectors.known";
export const FIRST_PARTY_MENU_BAR_CONNECTOR_ID =
  "com.gormanity.ytm-enhancer.menu-bar";
export const FIRST_PARTY_CLI_CONNECTOR_ID = "com.gormanity.ytm-enhancer.cli";
export const FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID =
  "com.gormanity.ytm-enhancer.tray";
export const FIRST_PARTY_MENU_BAR_NATIVE_HOST_NAME =
  "com.gormanity.ytm_enhancer.menu_bar";
export const FIRST_PARTY_CLI_NATIVE_HOST_NAME =
  "com.gormanity.ytm_enhancer.cli";
export const FIRST_PARTY_WINDOWS_TRAY_NATIVE_HOST_NAME =
  "com.gormanity.ytm_enhancer.tray";
export const MENU_BAR_INSTALL_URL =
  "https://gormanity.github.io/ytm-enhancer/menu-bar/install.html";
export const MENU_BAR_UNINSTALL_URL = `${MENU_BAR_INSTALL_URL}#uninstall`;
export const MENU_BAR_HOMEBREW_COMMAND =
  "brew install --cask gormanity/tap/ytm-menu-bar";
export const CLI_INSTALL_URL =
  "https://github.com/gormanity/ytm-enhancer/tree/main/apps/cli";
export const WINDOWS_TRAY_INSTALL_URL =
  "https://github.com/gormanity/ytm-enhancer/releases?q=windows-tray-v&expanded=true";

export type ConnectorStatus =
  | "connected"
  | "disconnected"
  | "blocked"
  | "incompatible";

export type ConnectedAppAvailability =
  | "unknown"
  | "available"
  | "missing"
  | "error";

export interface KnownConnector {
  id: string;
  name: string;
  version: string;
  protocolVersion: string;
  permissions: ConnectorPermission[];
  enabled: boolean;
  lastSeenAt: number | null;
  lastConnectedAt: number | null;
  incompatible: boolean;
}

export interface ConnectedApp {
  id: string;
  name: string;
  version: string;
  protocolVersion: string;
  permissions: ConnectorPermission[];
  enabled: boolean;
  status: ConnectorStatus;
  lastSeenAt: number | null;
  lastConnectedAt: number | null;
}

export interface FirstPartyConnectedAppDefinition {
  id: string;
  name: string;
  description: string;
  nativeHostName: string;
  installUrl: string;
  installLabel: string;
  access: ConnectorPermission[];
  supportsUninstallRequest: boolean;
  homebrewCommand?: string;
}

export interface FirstPartyConnectedApp extends FirstPartyConnectedAppDefinition {
  availability: ConnectedAppAvailability;
  lastError: string | null;
  lastCheckedAt: number | null;
}

export type MenuBarConnectedApp = FirstPartyConnectedApp;

export interface ConnectedAppsSettings {
  enabled: boolean;
  firstPartyApps: FirstPartyConnectedApp[];
  menuBarApp: MenuBarConnectedApp;
  connectors: ConnectedApp[];
}

export const CONNECTOR_PERMISSION_LABELS: Record<ConnectorPermission, string> =
  {
    "playback:read": "Playback Info",
    "playback:control": "Playback Controls",
    "track:read": "Track Info",
    "ytm:focus": "Focus YouTube Music",
  };

const CONNECTOR_PERMISSION_SET = new Set<string>(CONNECTOR_PERMISSIONS);

export const FIRST_PARTY_CONNECTED_APP_DEFINITIONS: FirstPartyConnectedAppDefinition[] =
  [
    {
      id: FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
      name: "YTM Menu Bar",
      description: "Native macOS menu bar controls for YouTube Music.",
      nativeHostName: FIRST_PARTY_MENU_BAR_NATIVE_HOST_NAME,
      installUrl: MENU_BAR_INSTALL_URL,
      installLabel: "Download for macOS",
      homebrewCommand: MENU_BAR_HOMEBREW_COMMAND,
      access: ["playback:read", "track:read", "playback:control", "ytm:focus"],
      supportsUninstallRequest: true,
    },
    {
      id: FIRST_PARTY_CLI_CONNECTOR_ID,
      name: "YTM Enhancer CLI",
      description: "Command-line playback controls for YouTube Music.",
      nativeHostName: FIRST_PARTY_CLI_NATIVE_HOST_NAME,
      installUrl: CLI_INSTALL_URL,
      installLabel: "Install CLI",
      access: ["playback:read", "track:read", "playback:control", "ytm:focus"],
      supportsUninstallRequest: false,
    },
    {
      id: FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID,
      name: "YTM Tray",
      description: "Native Windows tray controls for YouTube Music.",
      nativeHostName: FIRST_PARTY_WINDOWS_TRAY_NATIVE_HOST_NAME,
      installUrl: WINDOWS_TRAY_INSTALL_URL,
      installLabel: "Install for Windows",
      access: ["playback:read", "track:read", "playback:control", "ytm:focus"],
      supportsUninstallRequest: false,
    },
  ];

export function firstPartyConnectedAppDefinition(
  connectorId: string,
): FirstPartyConnectedAppDefinition | undefined {
  return FIRST_PARTY_CONNECTED_APP_DEFINITIONS.find(
    (definition) => definition.id === connectorId,
  );
}

export function firstPartyConnectedAppNativeHostNames(): string[] {
  return FIRST_PARTY_CONNECTED_APP_DEFINITIONS.map(
    (definition) => definition.nativeHostName,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePermissions(value: unknown): ConnectorPermission[] {
  if (!Array.isArray(value)) return [];

  const permissions: ConnectorPermission[] = [];
  for (const permission of value) {
    if (
      typeof permission === "string" &&
      CONNECTOR_PERMISSION_SET.has(permission)
    ) {
      permissions.push(permission as ConnectorPermission);
    }
  }
  return permissions;
}

export function normalizeKnownConnectors(value: unknown): KnownConnector[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (typeof item.id !== "string" || item.id.length === 0) return [];

    return [
      {
        id: item.id,
        name:
          typeof item.name === "string" && item.name.length > 0
            ? item.name
            : item.id,
        version:
          typeof item.version === "string" && item.version.length > 0
            ? item.version
            : "0.0.0",
        protocolVersion:
          typeof item.protocolVersion === "string" &&
          item.protocolVersion.length > 0
            ? item.protocolVersion
            : "unknown",
        permissions: normalizePermissions(item.permissions),
        enabled: item.enabled !== false,
        lastSeenAt: normalizeTimestamp(item.lastSeenAt),
        lastConnectedAt: normalizeTimestamp(item.lastConnectedAt),
        incompatible: item.incompatible === true,
      },
    ];
  });
}

export function upsertKnownConnector(
  connectors: Map<string, KnownConnector>,
  manifest: ConnectorManifest,
  options: {
    now: number;
    status: ConnectorStatus;
  },
): Map<string, KnownConnector> {
  const existing = connectors.get(manifest.id);
  const incompatible =
    options.status === "incompatible" ||
    manifest.protocolVersion !== CONNECTOR_PROTOCOL_VERSION;
  const next = new Map(connectors);

  next.set(manifest.id, {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    protocolVersion: manifest.protocolVersion,
    permissions: [...manifest.permissions],
    enabled: existing?.enabled ?? true,
    lastSeenAt: options.now,
    lastConnectedAt:
      options.status === "connected"
        ? options.now
        : (existing?.lastConnectedAt ?? null),
    incompatible,
  });

  return next;
}

export function setKnownConnectorEnabled(
  connectors: Map<string, KnownConnector>,
  connectorId: string,
  enabled: boolean,
): Map<string, KnownConnector> | null {
  const existing = connectors.get(connectorId);
  if (!existing) return null;

  const next = new Map(connectors);
  next.set(connectorId, { ...existing, enabled });
  return next;
}

export function createMenuBarConnectedApp(
  overrides: Partial<MenuBarConnectedApp> = {},
): MenuBarConnectedApp {
  return createFirstPartyConnectedApp(
    FIRST_PARTY_CONNECTED_APP_DEFINITIONS[0]!,
    overrides,
  );
}

export function createFirstPartyConnectedApp(
  definition: FirstPartyConnectedAppDefinition,
  overrides: Partial<FirstPartyConnectedApp> = {},
): FirstPartyConnectedApp {
  return {
    ...definition,
    availability: "unknown",
    lastError: null,
    lastCheckedAt: null,
    ...overrides,
  };
}

export function createConnectedAppsSettings(
  enabled: boolean,
  connectors: Map<string, KnownConnector>,
  connectedConnectorIds: Set<string> = new Set(),
  firstPartyAppOverrides: Partial<
    Record<string, Partial<FirstPartyConnectedApp>>
  > = {},
): ConnectedAppsSettings {
  const firstPartyApps = FIRST_PARTY_CONNECTED_APP_DEFINITIONS.map(
    (definition) =>
      createFirstPartyConnectedApp(
        definition,
        firstPartyAppOverrides[definition.id] ?? {},
      ),
  );
  const menuBarApp =
    firstPartyApps.find(
      (app) => app.id === FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
    ) ?? createMenuBarConnectedApp();

  return {
    enabled,
    firstPartyApps,
    menuBarApp,
    connectors: Array.from(connectors.values())
      .map((connector): ConnectedApp => {
        const status: ConnectorStatus = connector.incompatible
          ? "incompatible"
          : !connector.enabled
            ? "blocked"
            : connectedConnectorIds.has(connector.id)
              ? "connected"
              : "disconnected";

        return {
          id: connector.id,
          name: connector.name,
          version: connector.version,
          protocolVersion: connector.protocolVersion,
          permissions: [...connector.permissions],
          enabled: connector.enabled,
          status,
          lastSeenAt: connector.lastSeenAt,
          lastConnectedAt: connector.lastConnectedAt,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

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
export const MENU_BAR_INSTALL_URL =
  "https://gormanity.github.io/ytm-enhancer/menu-bar/install.html";
export const MENU_BAR_HOMEBREW_COMMAND =
  "brew install --cask gormanity/tap/ytm-menu-bar";

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

export interface MenuBarConnectedApp {
  id: string;
  name: string;
  description: string;
  installUrl: string;
  homebrewCommand: string;
  availability: ConnectedAppAvailability;
  lastError: string | null;
  lastCheckedAt: number | null;
}

export interface ConnectedAppsSettings {
  enabled: boolean;
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

export function removeKnownConnector(
  connectors: Map<string, KnownConnector>,
  connectorId: string,
): Map<string, KnownConnector> {
  const next = new Map(connectors);
  next.delete(connectorId);
  return next;
}

export function createMenuBarConnectedApp(
  overrides: Partial<MenuBarConnectedApp> = {},
): MenuBarConnectedApp {
  return {
    id: FIRST_PARTY_MENU_BAR_CONNECTOR_ID,
    name: "YTM Menu Bar",
    description: "Native macOS menu bar controls for YouTube Music.",
    installUrl: MENU_BAR_INSTALL_URL,
    homebrewCommand: MENU_BAR_HOMEBREW_COMMAND,
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
  menuBarApp: Partial<MenuBarConnectedApp> = {},
): ConnectedAppsSettings {
  return {
    enabled,
    menuBarApp: createMenuBarConnectedApp(menuBarApp),
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

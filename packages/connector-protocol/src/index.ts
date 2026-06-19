export const CONNECTOR_PROTOCOL_VERSION = "1.0.0";

export const CONNECTOR_PERMISSIONS = [
  "playback:read",
  "playback:control",
  "track:read",
  "ytm:focus",
] as const;

export type ConnectorPermission = (typeof CONNECTOR_PERMISSIONS)[number];

export const CONNECTOR_PLAYBACK_ACTIONS = [
  "next",
  "pause",
  "play",
  "previous",
  "repeat",
  "shuffle",
  "togglePlay",
] as const;

export type ConnectorPlaybackAction =
  (typeof CONNECTOR_PLAYBACK_ACTIONS)[number];

export const CONNECTOR_EVENTS = ["playback.state"] as const;

export type ConnectorEventType = (typeof CONNECTOR_EVENTS)[number];

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  protocolVersion: string;
  permissions: ConnectorPermission[];
}

export interface ConnectorTrackMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
  year: number | null;
  artworkUrl: string | null;
}

export interface ConnectorPlaybackState extends ConnectorTrackMetadata {
  nextTrack: ConnectorTrackMetadata | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  isShuffling: boolean | null;
  repeatMode: "off" | "all" | "one" | null;
}

export interface ConnectorHelloMessage {
  type: "connector.hello";
  requestId: string;
  manifest: ConnectorManifest;
}

export interface ConnectorSubscribeMessage {
  type: "connector.subscribe";
  requestId: string;
  events: ConnectorEventType[];
}

export interface ConnectorDisconnectMessage {
  type: "connector.disconnect";
  requestId: string;
}

export interface PlaybackGetStateMessage {
  type: "playback.getState";
  requestId: string;
}

export interface PlaybackActionMessage {
  type: "playback.action";
  requestId: string;
  action: ConnectorPlaybackAction;
}

export interface PlaybackSeekMessage {
  type: "playback.seek";
  requestId: string;
  time: number;
}

export interface YtmFocusMessage {
  type: "ytm.focus";
  requestId: string;
}

export type ConnectorMessage =
  | ConnectorHelloMessage
  | ConnectorSubscribeMessage
  | ConnectorDisconnectMessage
  | PlaybackGetStateMessage
  | PlaybackActionMessage
  | PlaybackSeekMessage
  | YtmFocusMessage;

export interface ConnectorReadyMessage {
  type: "connector.ready";
  requestId: string;
  connectorId: string;
  protocolVersion: string;
}

export interface ConnectorAckMessage {
  type: "connector.ack";
  requestId: string;
}

export interface ConnectorErrorMessage {
  type: "connector.error";
  requestId?: string;
  code: string;
  message: string;
}

export interface StateUpdateMessage {
  type: "playback.state";
  requestId?: string;
  state: ConnectorPlaybackState;
}

export interface ConnectorUninstallRequestedMessage {
  type: "connector.uninstallRequested";
}

export type ConnectorOutboundMessage =
  | ConnectorReadyMessage
  | ConnectorAckMessage
  | ConnectorErrorMessage
  | StateUpdateMessage
  | ConnectorUninstallRequestedMessage;

export type ConnectorValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function invalid<T>(error: string): ConnectorValidationResult<T> {
  return { ok: false, error };
}

function isConnectorPermission(value: unknown): value is ConnectorPermission {
  return (
    typeof value === "string" &&
    CONNECTOR_PERMISSIONS.includes(value as ConnectorPermission)
  );
}

function isConnectorPlaybackAction(
  value: unknown,
): value is ConnectorPlaybackAction {
  return (
    typeof value === "string" &&
    CONNECTOR_PLAYBACK_ACTIONS.includes(value as ConnectorPlaybackAction)
  );
}

function isConnectorEventType(value: unknown): value is ConnectorEventType {
  return (
    typeof value === "string" &&
    CONNECTOR_EVENTS.includes(value as ConnectorEventType)
  );
}

function formatOptions(values: readonly string[]): string {
  const quoted = values.map((value) => `"${value}"`);
  if (quoted.length === 1) return quoted[0]!;
  return `${quoted.slice(0, -1).join(", ")}, or ${quoted.at(-1)}`;
}

function validateRequestId(
  value: Record<string, unknown>,
): ConnectorValidationResult<string> {
  if (!isNonEmptyString(value.requestId)) {
    return invalid("requestId must be a non-empty string");
  }
  return { ok: true, value: value.requestId };
}

export function validateConnectorManifest(
  value: unknown,
): ConnectorValidationResult<ConnectorManifest> {
  if (!isRecord(value)) return invalid("manifest must be an object");
  if (!isNonEmptyString(value.id)) {
    return invalid("manifest id must be a non-empty string");
  }
  if (!isNonEmptyString(value.name)) {
    return invalid("manifest name must be a non-empty string");
  }
  if (!isNonEmptyString(value.version)) {
    return invalid("manifest version must be a non-empty string");
  }
  if (!isNonEmptyString(value.protocolVersion)) {
    return invalid("manifest protocolVersion must be a non-empty string");
  }
  if (!Array.isArray(value.permissions)) {
    return invalid("manifest permissions must be an array");
  }

  const permissions: ConnectorPermission[] = [];
  for (const permission of value.permissions) {
    if (!isConnectorPermission(permission)) {
      return invalid(
        `manifest permissions contain unsupported value ${JSON.stringify(
          permission,
        )}`,
      );
    }
    permissions.push(permission);
  }

  return {
    ok: true,
    value: {
      id: value.id,
      name: value.name,
      version: value.version,
      protocolVersion: value.protocolVersion,
      permissions,
    },
  };
}

export function validateConnectorMessage(
  value: unknown,
): ConnectorValidationResult<ConnectorMessage> {
  if (!isRecord(value)) return invalid("message must be an object");
  if (!isNonEmptyString(value.type)) {
    return invalid("type must be a non-empty string");
  }

  const requestId = validateRequestId(value);
  if (!requestId.ok) return requestId;

  switch (value.type) {
    case "connector.hello": {
      const manifest = validateConnectorManifest(value.manifest);
      if (!manifest.ok) return invalid(manifest.error);
      return {
        ok: true,
        value: {
          type: value.type,
          requestId: requestId.value,
          manifest: manifest.value,
        },
      };
    }
    case "connector.subscribe": {
      if (!Array.isArray(value.events)) {
        return invalid("events must be an array");
      }
      const events: ConnectorEventType[] = [];
      for (const event of value.events) {
        if (!isConnectorEventType(event)) {
          return invalid(
            `events contain unsupported value ${JSON.stringify(event)}`,
          );
        }
        events.push(event);
      }
      return {
        ok: true,
        value: { type: value.type, requestId: requestId.value, events },
      };
    }
    case "connector.disconnect":
    case "playback.getState":
    case "ytm.focus":
      return {
        ok: true,
        value: { type: value.type, requestId: requestId.value },
      };
    case "playback.action":
      if (!isConnectorPlaybackAction(value.action)) {
        return invalid(
          `action must be ${formatOptions(CONNECTOR_PLAYBACK_ACTIONS)}`,
        );
      }
      return {
        ok: true,
        value: {
          type: value.type,
          requestId: requestId.value,
          action: value.action,
        },
      };
    case "playback.seek":
      if (typeof value.time !== "number" || !Number.isFinite(value.time)) {
        return invalid("time must be a finite number");
      }
      if (value.time < 0)
        return invalid("time must be greater than or equal to 0");
      return {
        ok: true,
        value: {
          type: value.type,
          requestId: requestId.value,
          time: value.time,
        },
      };
    default:
      return invalid(`unsupported message type ${JSON.stringify(value.type)}`);
  }
}

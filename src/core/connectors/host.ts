import {
  CONNECTOR_PROTOCOL_VERSION,
  validateConnectorMessage,
  type ConnectorEventType,
  type ConnectorManifest,
  type ConnectorMessage,
  type ConnectorOutboundMessage,
  type ConnectorPermission,
  type ConnectorPlaybackState,
  type StateUpdateMessage,
} from "@ytm-enhancer/connector-protocol";
import type { PlaybackAction, PlaybackState } from "../types";
import type { YtmRuntimeClient } from "../ytm-client";

export const CONNECTOR_HOST_ENABLED_DEFAULT = false;

export type ConnectorHostErrorCode =
  | "host_disabled"
  | "invalid_message"
  | "unsupported_protocol"
  | "connector_blocked"
  | "connector_not_registered"
  | "permission_denied"
  | "route_failed";

export interface ConnectorHostError {
  code: ConnectorHostErrorCode;
  message: string;
}

export type ConnectorHostResult =
  | { ok: true; message?: ConnectorOutboundMessage }
  | { ok: false; error: ConnectorHostError };

export type ConnectorTransportMessageHandler = (
  connectionId: string,
  message: unknown,
) => Promise<ConnectorHostResult>;

export interface ConnectorTransport {
  start(handler: ConnectorTransportMessageHandler): void;
  stop(): void;
  send(
    connectionId: string,
    message: ConnectorOutboundMessage,
  ): void | Promise<void>;
}

export interface ConnectorSessionSnapshot {
  connectionId: string;
  manifest: ConnectorManifest;
  subscribedEvents: ConnectorEventType[];
  connectedAt: number;
}

export interface ConnectorHost {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  start(): void;
  stop(): void;
  receive(connectionId: string, message: unknown): Promise<ConnectorHostResult>;
  publishPlaybackState(state: PlaybackState): Promise<void>;
  listSessions(): ConnectorSessionSnapshot[];
  disconnect(connectionId: string): void;
}

export interface ConnectorHostOptions {
  enabled?: boolean;
  ytm: Pick<
    YtmRuntimeClient,
    "executePlaybackAction" | "getPlaybackState" | "seekTo"
  >;
  supportedProtocolVersions?: readonly string[];
  transports?: readonly ConnectorTransport[];
  isConnectorAllowed?: (manifest: ConnectorManifest) => boolean;
  onConnectorSeen?: (
    manifest: ConnectorManifest,
    status: "connected" | "blocked" | "incompatible",
  ) => void;
  onError?: (error: ConnectorHostError) => void;
  now?: () => number;
}

interface ConnectorSession {
  connectionId: string;
  manifest: ConnectorManifest;
  permissions: Set<ConnectorPermission>;
  subscribedEvents: Set<ConnectorEventType>;
  connectedAt: number;
}

function errorResult(
  code: ConnectorHostErrorCode,
  message: string,
): ConnectorHostResult {
  return { ok: false, error: { code, message } };
}

function ack(requestId: string): ConnectorHostResult {
  return { ok: true, message: { type: "connector.ack", requestId } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toConnectorPlaybackState(
  state: PlaybackState,
  session: ConnectorSession,
): ConnectorPlaybackState {
  const canReadTrack = session.permissions.has("track:read");
  return {
    title: canReadTrack ? state.title : null,
    artist: canReadTrack ? state.artist : null,
    album: canReadTrack ? state.album : null,
    year: canReadTrack ? state.year : null,
    artworkUrl: canReadTrack ? state.artworkUrl : null,
    isPlaying: state.isPlaying,
    progress: state.progress,
    duration: state.duration,
    isShuffling: state.isShuffling ?? null,
    repeatMode: state.repeatMode ?? null,
  };
}

export function createConnectorHost(
  options: ConnectorHostOptions,
): ConnectorHost {
  let enabled = options.enabled ?? CONNECTOR_HOST_ENABLED_DEFAULT;
  let started = false;
  const sessions = new Map<string, ConnectorSession>();
  const supportedProtocolVersions = new Set(
    options.supportedProtocolVersions ?? [CONNECTOR_PROTOCOL_VERSION],
  );
  const transports = options.transports ?? [];
  const now = options.now ?? Date.now;

  const reportError = (error: ConnectorHostError): void => {
    try {
      options.onError?.(error);
    } catch {
      // Connector host diagnostics must not affect extension behavior.
    }
  };

  const requireSession = (
    connectionId: string,
  ): ConnectorSession | ConnectorHostResult => {
    const session = sessions.get(connectionId);
    if (session) return session;
    return errorResult(
      "connector_not_registered",
      "Connector must complete connector.hello first",
    );
  };

  const requirePermission = (
    session: ConnectorSession,
    permission: ConnectorPermission,
  ): ConnectorHostResult | null => {
    if (session.permissions.has(permission)) return null;
    return errorResult(
      "permission_denied",
      `Connector ${session.manifest.id} is missing ${permission}`,
    );
  };

  const deliver = async (
    connectionId: string,
    message: ConnectorOutboundMessage,
  ): Promise<void> => {
    await Promise.allSettled(
      transports.map(async (transport) => {
        await transport.send(connectionId, message);
      }),
    );
  };

  const handleHello = (
    connectionId: string,
    message: Extract<ConnectorMessage, { type: "connector.hello" }>,
  ): ConnectorHostResult => {
    if (!supportedProtocolVersions.has(message.manifest.protocolVersion)) {
      options.onConnectorSeen?.(message.manifest, "incompatible");
      return errorResult(
        "unsupported_protocol",
        `Unsupported connector protocol version: ${message.manifest.protocolVersion}`,
      );
    }

    if (options.isConnectorAllowed?.(message.manifest) === false) {
      options.onConnectorSeen?.(message.manifest, "blocked");
      return errorResult(
        "connector_blocked",
        `Connector ${message.manifest.id} is disabled`,
      );
    }

    sessions.set(connectionId, {
      connectionId,
      manifest: message.manifest,
      permissions: new Set(message.manifest.permissions),
      subscribedEvents: new Set(),
      connectedAt: now(),
    });
    options.onConnectorSeen?.(message.manifest, "connected");

    return {
      ok: true,
      message: {
        type: "connector.ready",
        requestId: message.requestId,
        connectorId: message.manifest.id,
        protocolVersion: message.manifest.protocolVersion,
      },
    };
  };

  const routeMessage = async (
    connectionId: string,
    message: ConnectorMessage,
  ): Promise<ConnectorHostResult> => {
    if (message.type === "connector.hello") {
      return handleHello(connectionId, message);
    }

    const session = requireSession(connectionId);
    if ("ok" in session) return session;

    switch (message.type) {
      case "connector.subscribe": {
        const missingPermission = requirePermission(session, "playback:read");
        if (missingPermission) return missingPermission;
        message.events.forEach((event) => session.subscribedEvents.add(event));
        return ack(message.requestId);
      }
      case "connector.disconnect":
        sessions.delete(connectionId);
        return ack(message.requestId);
      case "playback.getState": {
        const missingPermission = requirePermission(session, "playback:read");
        if (missingPermission) return missingPermission;
        const state = await options.ytm.getPlaybackState();
        return {
          ok: true,
          message: {
            type: "playback.state",
            requestId: message.requestId,
            state: toConnectorPlaybackState(state, session),
          },
        };
      }
      case "playback.action": {
        const missingPermission = requirePermission(
          session,
          "playback:control",
        );
        if (missingPermission) return missingPermission;
        await options.ytm.executePlaybackAction(
          message.action as PlaybackAction,
        );
        return ack(message.requestId);
      }
      case "playback.seek": {
        const missingPermission = requirePermission(
          session,
          "playback:control",
        );
        if (missingPermission) return missingPermission;
        await options.ytm.seekTo(message.time);
        return ack(message.requestId);
      }
    }
  };

  return {
    isEnabled() {
      return enabled;
    },

    setEnabled(nextEnabled: boolean) {
      enabled = nextEnabled;
      if (!enabled) {
        this.stop();
        sessions.clear();
      }
    },

    start() {
      if (!enabled || started) return;
      started = true;
      for (const transport of transports) {
        try {
          transport.start(this.receive);
        } catch (err) {
          reportError({ code: "route_failed", message: errorMessage(err) });
        }
      }
    },

    stop() {
      if (!started) return;
      started = false;
      for (const transport of transports) {
        try {
          transport.stop();
        } catch (err) {
          reportError({ code: "route_failed", message: errorMessage(err) });
        }
      }
    },

    async receive(
      connectionId: string,
      message: unknown,
    ): Promise<ConnectorHostResult> {
      if (!enabled) {
        return errorResult("host_disabled", "Connector support is disabled");
      }

      const parsed = validateConnectorMessage(message);
      if (!parsed.ok) {
        return errorResult(
          "invalid_message",
          `Invalid connector message: ${parsed.error}`,
        );
      }

      try {
        return await routeMessage(connectionId, parsed.value);
      } catch (err) {
        const error = {
          code: "route_failed" as const,
          message: errorMessage(err),
        };
        reportError(error);
        return { ok: false, error };
      }
    },

    async publishPlaybackState(state: PlaybackState): Promise<void> {
      if (!enabled) return;
      const deliveries: Promise<void>[] = [];

      for (const session of sessions.values()) {
        if (!session.subscribedEvents.has("playback.state")) continue;
        if (!session.permissions.has("playback:read")) continue;

        const message: StateUpdateMessage = {
          type: "playback.state",
          state: toConnectorPlaybackState(state, session),
        };
        deliveries.push(deliver(session.connectionId, message));
      }

      await Promise.allSettled(deliveries);
    },

    listSessions() {
      return Array.from(sessions.values()).map((session) => ({
        connectionId: session.connectionId,
        manifest: session.manifest,
        subscribedEvents: Array.from(session.subscribedEvents),
        connectedAt: session.connectedAt,
      }));
    },

    disconnect(connectionId: string) {
      sessions.delete(connectionId);
    },
  };
}

import type { ConnectorOutboundMessage } from "@ytm-enhancer/connector-protocol";
import type {
  ConnectorHostResult,
  ConnectorTransport,
  ConnectorTransportMessageHandler,
} from "./host";

export const NATIVE_MESSAGING_HOST_NAME = "com.gormanity.ytm_enhancer.menu_bar";
export const NATIVE_MESSAGING_CONNECTION_ID = `native:${NATIVE_MESSAGING_HOST_NAME}`;

interface NativeMessagingEvent<TListener extends (...args: never[]) => void> {
  addListener(listener: TListener): void;
  removeListener(listener: TListener): void;
}

interface NativeMessagingPort {
  onMessage: NativeMessagingEvent<(message: unknown) => void>;
  onDisconnect: NativeMessagingEvent<() => void>;
  postMessage(message: unknown): void;
  disconnect(): void;
}

interface NativeMessagingRuntime {
  connectNative?(hostName: string): NativeMessagingPort;
  lastError?: { message?: string };
}

export interface NativeMessagingTransportOptions {
  hostName?: string;
  connectionId?: string;
  runtime?: NativeMessagingRuntime;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

function defaultRuntime(): NativeMessagingRuntime | undefined {
  return typeof chrome === "undefined" ? undefined : chrome.runtime;
}

function requestIdFrom(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const requestId = (message as { requestId?: unknown }).requestId;
  return typeof requestId === "string" ? requestId : undefined;
}

function errorToOutboundMessage(
  result: Extract<ConnectorHostResult, { ok: false }>,
  requestId?: string,
): ConnectorOutboundMessage {
  return {
    type: "connector.error",
    requestId,
    code: result.error.code,
    message: result.error.message,
  };
}

function reportError(
  onError: ((error: Error) => void) | undefined,
  error: unknown,
): void {
  if (!onError) return;
  try {
    onError(error instanceof Error ? error : new Error(String(error)));
  } catch {
    // Transport diagnostics must not affect connector host behavior.
  }
}

function reportConnect(onConnect: (() => void) | undefined): void {
  if (!onConnect) return;
  try {
    onConnect();
  } catch {
    // Transport diagnostics must not affect connector host behavior.
  }
}

function reportDisconnect(onDisconnect: (() => void) | undefined): void {
  if (!onDisconnect) return;
  try {
    onDisconnect();
  } catch {
    // Transport diagnostics must not affect connector host behavior.
  }
}

export function createNativeMessagingTransport(
  options: NativeMessagingTransportOptions = {},
): ConnectorTransport {
  const hostName = options.hostName ?? NATIVE_MESSAGING_HOST_NAME;
  const connectionId = options.connectionId ?? `native:${hostName}`;
  const runtime = options.runtime ?? defaultRuntime();
  let port: NativeMessagingPort | null = null;
  let handler: ConnectorTransportMessageHandler | null = null;
  let messageListener: ((message: unknown) => void) | null = null;
  let disconnectListener: (() => void) | null = null;

  const sendToPort = (message: ConnectorOutboundMessage): void => {
    if (!port) return;
    try {
      port.postMessage(message);
    } catch (error) {
      reportError(options.onError, error);
    }
  };

  return {
    start(nextHandler: ConnectorTransportMessageHandler): void {
      if (port) return;
      handler = nextHandler;

      if (typeof runtime?.connectNative !== "function") {
        reportError(
          options.onError,
          new Error("Browser native messaging is unavailable"),
        );
        return;
      }

      try {
        port = runtime.connectNative(hostName);
      } catch (error) {
        reportError(options.onError, error);
        port = null;
        return;
      }
      reportConnect(options.onConnect);

      messageListener = (message: unknown) => {
        if (!handler) return;
        void handler(connectionId, message)
          .then((result) => {
            if (result.ok) {
              if (result.message) sendToPort(result.message);
              return;
            }
            sendToPort(errorToOutboundMessage(result, requestIdFrom(message)));
          })
          .catch((error) => {
            reportError(options.onError, error);
            sendToPort({
              type: "connector.error",
              requestId: requestIdFrom(message),
              code: "route_failed",
              message: error instanceof Error ? error.message : String(error),
            });
          });
      };

      disconnectListener = () => {
        const message = runtime.lastError?.message;
        if (message) reportError(options.onError, new Error(message));
        reportDisconnect(options.onDisconnect);
        port = null;
      };

      port.onMessage.addListener(messageListener);
      port.onDisconnect.addListener(disconnectListener);
    },

    stop(): void {
      if (!port) return;
      if (messageListener) port.onMessage.removeListener(messageListener);
      if (disconnectListener) {
        port.onDisconnect.removeListener(disconnectListener);
      }
      const activePort = port;
      port = null;
      handler = null;
      messageListener = null;
      disconnectListener = null;
      activePort.disconnect();
    },

    send(targetConnectionId, message): void {
      if (targetConnectionId !== connectionId) return;
      sendToPort(message);
    },
  };
}

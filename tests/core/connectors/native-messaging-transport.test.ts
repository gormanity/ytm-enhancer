import { describe, expect, it, vi } from "vitest";
import type { ConnectorOutboundMessage } from "@ytm-enhancer/connector-protocol";
import type { ConnectorHostResult } from "@/core/connectors/host";
import {
  createNativeMessagingTransport,
  NATIVE_MESSAGING_CONNECTION_ID,
  NATIVE_MESSAGING_HOST_NAME,
} from "@/core/connectors/native-messaging-transport";

function createChromeEvent<TListener extends (...args: never[]) => void>() {
  const listeners = new Set<TListener>();
  return {
    addListener: vi.fn((listener: TListener) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: TListener) => {
      listeners.delete(listener);
    }),
    emit(...args: Parameters<TListener>) {
      for (const listener of listeners) listener(...args);
    },
  };
}

function createPort() {
  return {
    onMessage: createChromeEvent<(message: unknown) => void>(),
    onDisconnect: createChromeEvent<() => void>(),
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("native messaging connector transport", () => {
  it("connects to the first-party native host only when started", () => {
    const port = createPort();
    const runtime = {
      connectNative: vi.fn(() => port),
    };
    const transport = createNativeMessagingTransport({ runtime });

    expect(runtime.connectNative).not.toHaveBeenCalled();

    transport.start(vi.fn());

    expect(runtime.connectNative).toHaveBeenCalledWith(
      NATIVE_MESSAGING_HOST_NAME,
    );
  });

  it("reports successful native host startup", () => {
    const port = createPort();
    const runtime = {
      connectNative: vi.fn(() => port),
    };
    const onConnect = vi.fn();
    const transport = createNativeMessagingTransport({ runtime, onConnect });

    transport.start(vi.fn());

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("reports native host startup failures", () => {
    const onError = vi.fn();
    const runtime = {
      connectNative: vi.fn(() => {
        throw new Error("Specified native messaging host not found.");
      }),
    };
    const transport = createNativeMessagingTransport({ runtime, onError });

    transport.start(vi.fn());

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Specified native messaging host not found.",
      }),
    );
  });

  it("reports native host disconnect errors", () => {
    const port = createPort();
    const runtime = {
      connectNative: vi.fn((_hostName: string) => port),
      lastError: undefined as { message?: string } | undefined,
    };
    const onError = vi.fn();
    const transport = createNativeMessagingTransport({ runtime, onError });

    transport.start(vi.fn());
    runtime.lastError = { message: "Native host exited unexpectedly." };
    port.onDisconnect.emit();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Native host exited unexpectedly.",
      }),
    );
  });

  it("routes native messages through the connector host handler", async () => {
    const port = createPort();
    const runtime = {
      connectNative: vi.fn(() => port),
    };
    const readyMessage: ConnectorOutboundMessage = {
      type: "connector.ready",
      requestId: "hello-1",
      connectorId: "com.gormanity.ytm-enhancer.menu-bar",
      protocolVersion: "1.0.0",
    };
    const handler = vi
      .fn<() => Promise<ConnectorHostResult>>()
      .mockResolvedValue({ ok: true, message: readyMessage });
    const transport = createNativeMessagingTransport({ runtime });

    transport.start(handler);
    port.onMessage.emit({ type: "connector.hello", requestId: "hello-1" });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith(NATIVE_MESSAGING_CONNECTION_ID, {
        type: "connector.hello",
        requestId: "hello-1",
      });
      expect(port.postMessage).toHaveBeenCalledWith(readyMessage);
    });
  });

  it("converts connector host errors into protocol error messages", async () => {
    const port = createPort();
    const runtime = {
      connectNative: vi.fn(() => port),
    };
    const handler = vi
      .fn<() => Promise<ConnectorHostResult>>()
      .mockResolvedValue({
        ok: false,
        error: {
          code: "host_disabled",
          message: "Connector support is disabled",
        },
      });
    const transport = createNativeMessagingTransport({ runtime });

    transport.start(handler);
    port.onMessage.emit({ type: "playback.getState", requestId: "state-1" });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        type: "connector.error",
        requestId: "state-1",
        code: "host_disabled",
        message: "Connector support is disabled",
      });
    });
  });

  it("posts outbound messages to the native host and disconnects on stop", () => {
    const port = createPort();
    const runtime = {
      connectNative: vi.fn(() => port),
    };
    const transport = createNativeMessagingTransport({ runtime });
    const message: ConnectorOutboundMessage = {
      type: "connector.ack",
      requestId: "subscribe-1",
    };

    transport.start(vi.fn());
    transport.send(NATIVE_MESSAGING_CONNECTION_ID, message);
    transport.stop();

    expect(port.postMessage).toHaveBeenCalledWith(message);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });
});

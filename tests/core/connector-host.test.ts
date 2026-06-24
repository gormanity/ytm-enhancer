import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONNECTOR_PROTOCOL_VERSION,
  type ConnectorManifest,
} from "@ytm-enhancer/connector-protocol";
import { createConnectorHost } from "@/core/connectors/host";
import type { PlaybackState } from "@/core/types";
import { createMockYtmRuntimeClient } from "../helpers/module-context";

const validManifest: ConnectorManifest = {
  id: "com.example.menu-bar",
  name: "Menu Bar",
  version: "0.1.0",
  protocolVersion: CONNECTOR_PROTOCOL_VERSION,
  permissions: ["playback:read", "playback:control", "track:read", "ytm:focus"],
};

const playbackState: PlaybackState = {
  title: "Song",
  artist: "Artist",
  album: "Album",
  year: 2026,
  artworkUrl: "https://example.com/art.jpg",
  nextTrack: {
    title: "Next Song",
    artist: "Next Artist",
    album: "Next Album",
    year: 2027,
    artworkUrl: "https://example.com/next.jpg",
  },
  isPlaying: true,
  progress: 12,
  duration: 60,
  isShuffling: false,
  repeatMode: "off",
};

async function connect(host: ReturnType<typeof createConnectorHost>) {
  const result = await host.receive("connection-1", {
    type: "connector.hello",
    requestId: "hello-1",
    manifest: validManifest,
  });

  expect(result).toEqual({
    ok: true,
    message: {
      type: "connector.ready",
      requestId: "hello-1",
      connectorId: validManifest.id,
      protocolVersion: CONNECTOR_PROTOCOL_VERSION,
    },
  });
}

describe("ConnectorHost", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is disabled by default and does not route connector messages", async () => {
    const ytm = createMockYtmRuntimeClient();
    const host = createConnectorHost({ ytm });

    const result = await host.receive("connection-1", {
      type: "connector.hello",
      requestId: "hello-1",
      manifest: validManifest,
    });

    expect(host.isEnabled()).toBe(false);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "host_disabled",
        message: "Connector support is disabled",
      },
    });
    expect(ytm.getPlaybackState).not.toHaveBeenCalled();
  });

  it("rejects invalid connector messages", async () => {
    const host = createConnectorHost({
      enabled: true,
      ytm: createMockYtmRuntimeClient(),
    });

    const result = await host.receive("connection-1", {
      type: "playback.action",
      requestId: "action-1",
      action: "deleteLibrary",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_message",
        message:
          'Invalid connector message: action must be "next", "pause", "play", "previous", "repeat", "shuffle", or "togglePlay"',
      },
    });
  });

  it("rejects unsupported protocol versions", async () => {
    const host = createConnectorHost({
      enabled: true,
      ytm: createMockYtmRuntimeClient(),
    });

    const result = await host.receive("connection-1", {
      type: "connector.hello",
      requestId: "hello-1",
      manifest: {
        ...validManifest,
        protocolVersion: "99.0.0",
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "unsupported_protocol",
        message: "Unsupported connector protocol version: 99.0.0",
      },
    });
  });

  it("rejects unknown permissions", async () => {
    const host = createConnectorHost({
      enabled: true,
      ytm: createMockYtmRuntimeClient(),
    });

    const result = await host.receive("connection-1", {
      type: "connector.hello",
      requestId: "hello-1",
      manifest: {
        ...validManifest,
        permissions: ["playback:read", "settings:read"],
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_message",
        message:
          'Invalid connector message: manifest permissions contain unsupported value "settings:read"',
      },
    });
  });

  it("routes playback state through the centralized YTM runtime API", async () => {
    const ytm = createMockYtmRuntimeClient({
      getPlaybackState: vi.fn().mockResolvedValue(playbackState),
    });
    const host = createConnectorHost({ enabled: true, ytm });
    await connect(host);

    const result = await host.receive("connection-1", {
      type: "playback.getState",
      requestId: "state-1",
    });

    expect(result).toEqual({
      ok: true,
      message: {
        type: "playback.state",
        requestId: "state-1",
        state: {
          title: "Song",
          artist: "Artist",
          album: "Album",
          year: 2026,
          artworkUrl: "https://example.com/art.jpg",
          nextTrack: {
            title: "Next Song",
            artist: "Next Artist",
            album: "Next Album",
            year: 2027,
            artworkUrl: "https://example.com/next.jpg",
          },
          isPlaying: true,
          progress: 12,
          duration: 60,
          isShuffling: false,
          repeatMode: "off",
        },
      },
    });
    expect(ytm.getPlaybackState).toHaveBeenCalledTimes(1);
  });

  it("keeps connector registration observer failures isolated from handshakes", async () => {
    const onError = vi.fn();
    const host = createConnectorHost({
      enabled: true,
      ytm: createMockYtmRuntimeClient(),
      onConnectorSeen: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      onError,
    });

    const result = await host.receive("connection-1", {
      type: "connector.hello",
      requestId: "hello-1",
      manifest: validManifest,
    });

    expect(result).toEqual({
      ok: true,
      message: {
        type: "connector.ready",
        requestId: "hello-1",
        connectorId: validManifest.id,
        protocolVersion: CONNECTOR_PROTOCOL_VERSION,
      },
    });
    expect(onError).toHaveBeenCalledWith({
      code: "route_failed",
      message: "storage unavailable",
    });
  });

  it("redacts next track metadata when track read permission is missing", async () => {
    const ytm = createMockYtmRuntimeClient({
      getPlaybackState: vi.fn().mockResolvedValue(playbackState),
    });
    const host = createConnectorHost({ enabled: true, ytm });

    const hello = await host.receive("connection-1", {
      type: "connector.hello",
      requestId: "hello-1",
      manifest: {
        ...validManifest,
        permissions: ["playback:read"],
      },
    });
    expect(hello.ok).toBe(true);

    const result = await host.receive("connection-1", {
      type: "playback.getState",
      requestId: "state-1",
    });

    expect(result).toEqual({
      ok: true,
      message: {
        type: "playback.state",
        requestId: "state-1",
        state: expect.objectContaining({
          title: null,
          artist: null,
          album: null,
          year: null,
          artworkUrl: null,
          nextTrack: null,
          isPlaying: true,
          progress: 12,
          duration: 60,
        }),
      },
    });
  });

  it("routes playback controls through the centralized YTM runtime API", async () => {
    const ytm = createMockYtmRuntimeClient();
    const host = createConnectorHost({ enabled: true, ytm });
    await connect(host);

    const result = await host.receive("connection-1", {
      type: "playback.action",
      requestId: "action-1",
      action: "next",
    });

    expect(result).toEqual({
      ok: true,
      message: { type: "connector.ack", requestId: "action-1" },
    });
    expect(ytm.executePlaybackAction).toHaveBeenCalledWith("next");
  });

  it("publishes immediate and delayed playback updates after connector playback actions", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(undefined);
    const nextState = { ...playbackState, title: "Next Song", progress: 0 };
    const settledState = { ...nextState, progress: 1 };
    const ytm = createMockYtmRuntimeClient({
      getPlaybackState: vi
        .fn()
        .mockResolvedValueOnce(nextState)
        .mockResolvedValueOnce(settledState),
    });
    const host = createConnectorHost({
      enabled: true,
      ytm,
      transports: [{ start: vi.fn(), stop: vi.fn(), send }],
    });
    await connect(host);
    await host.receive("connection-1", {
      type: "connector.subscribe",
      requestId: "subscribe-1",
      events: ["playback.state"],
    });

    const result = await host.receive("connection-1", {
      type: "playback.action",
      requestId: "action-1",
      action: "next",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(result).toEqual({
      ok: true,
      message: { type: "connector.ack", requestId: "action-1" },
    });
    expect(ytm.executePlaybackAction).toHaveBeenCalledWith("next");
    expect(ytm.getPlaybackState).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith("connection-1", {
      type: "playback.state",
      state: expect.objectContaining({ title: "Next Song", progress: 0 }),
    });

    await vi.advanceTimersByTimeAsync(149);
    expect(ytm.getPlaybackState).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(ytm.getPlaybackState).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith("connection-1", {
      type: "playback.state",
      state: expect.objectContaining({ title: "Next Song", progress: 1 }),
    });
  });

  it("publishes playback updates after connector seek commands", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(undefined);
    const ytm = createMockYtmRuntimeClient({
      getPlaybackState: vi
        .fn()
        .mockResolvedValue({ ...playbackState, progress: 30 }),
    });
    const host = createConnectorHost({
      enabled: true,
      ytm,
      transports: [{ start: vi.fn(), stop: vi.fn(), send }],
    });
    await connect(host);
    await host.receive("connection-1", {
      type: "connector.subscribe",
      requestId: "subscribe-1",
      events: ["playback.state"],
    });

    const result = await host.receive("connection-1", {
      type: "playback.seek",
      requestId: "seek-1",
      time: 30,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(result).toEqual({
      ok: true,
      message: { type: "connector.ack", requestId: "seek-1" },
    });
    expect(ytm.seekTo).toHaveBeenCalledWith(30);
    expect(ytm.getPlaybackState).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("connection-1", {
      type: "playback.state",
      state: expect.objectContaining({ progress: 30 }),
    });
  });

  it("routes focus requests through the centralized YTM runtime API", async () => {
    const ytm = createMockYtmRuntimeClient();
    const host = createConnectorHost({ enabled: true, ytm });
    await connect(host);

    const result = await host.receive("connection-1", {
      type: "ytm.focus",
      requestId: "focus-1",
    });

    expect(result).toEqual({
      ok: true,
      message: { type: "connector.ack", requestId: "focus-1" },
    });
    expect(ytm.focusTab).toHaveBeenCalledWith();
  });

  it("routes YTM tab diagnostics through the centralized YTM runtime API", async () => {
    const ytm = createMockYtmRuntimeClient({
      listTabs: vi.fn().mockResolvedValue({
        selectedTabId: 10,
        tabs: [
          {
            id: 10,
            title: "YouTube Music",
            artworkUrl: null,
            isSelected: true,
          },
        ],
      }),
    });
    const host = createConnectorHost({ enabled: true, ytm });
    await connect(host);

    const result = await host.receive("connection-1", {
      type: "ytm.getStatus",
      requestId: "ytm-status-1",
    });

    expect(result).toEqual({
      ok: true,
      message: {
        type: "ytm.status",
        requestId: "ytm-status-1",
        status: {
          hasTabs: true,
          tabCount: 1,
          selectedTabKnown: true,
        },
      },
    });
    expect(ytm.listTabs).toHaveBeenCalledTimes(1);
  });

  it("requires explicit permission before focusing YouTube Music", async () => {
    const ytm = createMockYtmRuntimeClient();
    const host = createConnectorHost({ enabled: true, ytm });
    const hello = await host.receive("connection-1", {
      type: "connector.hello",
      requestId: "hello-1",
      manifest: {
        ...validManifest,
        permissions: ["playback:read", "playback:control", "track:read"],
      },
    });
    expect(hello.ok).toBe(true);

    const result = await host.receive("connection-1", {
      type: "ytm.focus",
      requestId: "focus-1",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "permission_denied",
        message: `Connector ${validManifest.id} is missing ytm:focus`,
      },
    });
    expect(ytm.focusTab).not.toHaveBeenCalled();
  });

  it("requires explicit permission before reading YTM tab diagnostics", async () => {
    const ytm = createMockYtmRuntimeClient();
    const host = createConnectorHost({ enabled: true, ytm });
    const hello = await host.receive("connection-1", {
      type: "connector.hello",
      requestId: "hello-1",
      manifest: {
        ...validManifest,
        permissions: ["playback:read", "playback:control", "track:read"],
      },
    });
    expect(hello.ok).toBe(true);

    const result = await host.receive("connection-1", {
      type: "ytm.getStatus",
      requestId: "ytm-status-1",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "permission_denied",
        message: `Connector ${validManifest.id} is missing ytm:focus`,
      },
    });
    expect(ytm.listTabs).not.toHaveBeenCalled();
  });

  it("can request uninstall from a connected connector session", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const host = createConnectorHost({
      enabled: true,
      ytm: createMockYtmRuntimeClient(),
      transports: [{ start: vi.fn(), stop: vi.fn(), send }],
    });
    await connect(host);

    await expect(host.requestUninstall(validManifest.id)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith("connection-1", {
      type: "connector.uninstallRequested",
    });
  });

  it("does not request uninstall when no connector session matches", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const host = createConnectorHost({
      enabled: true,
      ytm: createMockYtmRuntimeClient(),
      transports: [{ start: vi.fn(), stop: vi.fn(), send }],
    });
    await connect(host);

    await expect(host.requestUninstall("com.example.other")).resolves.toBe(
      false,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("notifies when playback state subscribers become active and inactive", async () => {
    const onPlaybackStateSubscriptionChanged = vi.fn();
    const host = createConnectorHost({
      enabled: true,
      ytm: createMockYtmRuntimeClient(),
      onPlaybackStateSubscriptionChanged,
    });
    await connect(host);

    expect(host.hasPlaybackStateSubscribers()).toBe(false);
    expect(onPlaybackStateSubscriptionChanged).not.toHaveBeenCalled();

    await host.receive("connection-1", {
      type: "connector.subscribe",
      requestId: "subscribe-1",
      events: ["playback.state"],
    });

    expect(host.hasPlaybackStateSubscribers()).toBe(true);
    expect(onPlaybackStateSubscriptionChanged).toHaveBeenCalledWith(true);

    await host.receive("connection-1", {
      type: "connector.disconnect",
      requestId: "disconnect-1",
    });

    expect(host.hasPlaybackStateSubscribers()).toBe(false);
    expect(onPlaybackStateSubscriptionChanged).toHaveBeenLastCalledWith(false);
  });

  it("keeps connector playback actions isolated from post-action refresh failures", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const ytm = createMockYtmRuntimeClient({
      getPlaybackState: vi.fn().mockRejectedValue(new Error("YTM tab closed")),
    });
    const host = createConnectorHost({ enabled: true, ytm, onError });
    await connect(host);
    await host.receive("connection-1", {
      type: "connector.subscribe",
      requestId: "subscribe-1",
      events: ["playback.state"],
    });

    const result = await host.receive("connection-1", {
      type: "playback.action",
      requestId: "action-1",
      action: "togglePlay",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(result).toEqual({
      ok: true,
      message: { type: "connector.ack", requestId: "action-1" },
    });
    expect(ytm.executePlaybackAction).toHaveBeenCalledWith("togglePlay");
    expect(onError).toHaveBeenCalledWith({
      code: "route_failed",
      message: "YTM tab closed",
    });
  });

  it("keeps connector failures isolated from core playback APIs", async () => {
    const getPlaybackState = vi
      .fn()
      .mockRejectedValueOnce(new Error("YTM tab closed"))
      .mockResolvedValueOnce(playbackState);
    const ytm = createMockYtmRuntimeClient({ getPlaybackState });
    const host = createConnectorHost({ enabled: true, ytm });
    await connect(host);

    const connectorResult = await host.receive("connection-1", {
      type: "playback.getState",
      requestId: "state-1",
    });

    expect(connectorResult).toEqual({
      ok: false,
      error: {
        code: "route_failed",
        message: "YTM tab closed",
      },
    });
    await expect(ytm.getPlaybackState()).resolves.toEqual(playbackState);
  });

  it("leaves playback APIs usable when no connectors are enabled", async () => {
    const ytm = createMockYtmRuntimeClient({
      getPlaybackState: vi.fn().mockResolvedValue(playbackState),
    });
    createConnectorHost({ ytm });

    await expect(ytm.getPlaybackState()).resolves.toEqual(playbackState);
  });
});

import { describe, expect, it, vi } from "vitest";
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
  permissions: ["playback:read", "playback:control", "track:read"],
};

const playbackState: PlaybackState = {
  title: "Song",
  artist: "Artist",
  album: "Album",
  year: 2026,
  artworkUrl: "https://example.com/art.jpg",
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

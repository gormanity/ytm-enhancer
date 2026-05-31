import { describe, expect, it, vi } from "vitest";
import { createAudioVisualizerClient } from "@/modules/audio-visualizer/client";
import type { RuntimeClient } from "@/core/messaging";

function createRuntime(): RuntimeClient {
  return {
    request: vi.fn().mockResolvedValue(true),
    command: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
}

describe("AudioVisualizerClient", () => {
  it("should read enabled state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAudioVisualizerClient(runtime);

    await expect(client.isEnabled()).resolves.toBe(true);

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-audio-visualizer-enabled",
    });
  });

  it("should write enabled state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAudioVisualizerClient(runtime);

    await client.setEnabled(false);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-audio-visualizer-enabled",
      enabled: false,
    });
  });

  it("should read a complete visualizer snapshot through the runtime API", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.request).mockResolvedValue({
      enabled: true,
      style: "waveform",
      target: "pip-only",
      tunings: {
        bars: { intensity: 1, thickness: 1, opacity: 1, colorMode: "white" },
        waveform: {
          intensity: 1.2,
          thickness: 1,
          opacity: 0.8,
          colorMode: "artwork-adaptive",
        },
        circular: { intensity: 1, thickness: 1, opacity: 1, colorMode: "white" },
      },
    });
    const client = createAudioVisualizerClient(runtime);

    await expect(client.getSnapshot()).resolves.toMatchObject({
      style: "waveform",
      target: "pip-only",
    });

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-audio-visualizer-snapshot",
    });
  });

  it("should write style through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAudioVisualizerClient(runtime);

    await client.setStyle("circular");

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-audio-visualizer-style",
      style: "circular",
    });
  });

  it("should write target through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAudioVisualizerClient(runtime);

    await client.setTarget("player-bar-only");

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-audio-visualizer-target",
      target: "player-bar-only",
    });
  });

  it("should write style tuning through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAudioVisualizerClient(runtime);
    const tuning = {
      intensity: 1.4,
      thickness: 0.9,
      opacity: 0.8,
      colorMode: "monochrome-dim" as const,
    };

    await client.setStyleTuning("bars", tuning);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-audio-visualizer-style-tuning",
      style: "bars",
      tuning,
    });
  });

  it("should write color mode through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAudioVisualizerClient(runtime);

    await client.setColorMode("artwork-adaptive");

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-audio-visualizer-color-mode",
      mode: "artwork-adaptive",
    });
  });
});

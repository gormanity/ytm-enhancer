import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAudioVisualizerPopupView } from "@/modules/audio-visualizer/popup";
import type { AudioVisualizerClient } from "@/modules/audio-visualizer/client";
import { createTestModuleContext } from "../../helpers/module-context";

describe("audio visualizer popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;
  const getStyleSelect = (container: HTMLElement) =>
    container.querySelector<HTMLSelectElement>(
      '[data-role="audio-visualizer-style-select"]',
    );
  const getTargetSelect = (container: HTMLElement) =>
    container.querySelector<HTMLSelectElement>(
      '[data-role="audio-visualizer-target-select"]',
    );
  const getColorModeSelect = (container: HTMLElement) =>
    container.querySelector<HTMLSelectElement>(
      '[data-role="audio-visualizer-color-mode-select"]',
    );

  function mockVisualizerMessages(
    snapshot: {
      style?: string;
      target?: string;
      tunings?: Record<string, Record<string, unknown>>;
    } = {},
  ) {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (!callback) return;
        if (message.type === "get-audio-visualizer-enabled") {
          callback({ ok: true, data: true });
          return;
        }
        if (message.type === "get-audio-visualizer-snapshot") {
          callback({
            ok: true,
            data: {
              style: snapshot.style ?? "bars",
              target: snapshot.target ?? "auto",
              tunings: snapshot.tunings ?? {
                bars: { intensity: 1, thickness: 1, opacity: 1 },
                waveform: { intensity: 1, thickness: 1, opacity: 1 },
                circular: { intensity: 1, thickness: 1, opacity: 1 },
              },
            },
          });
        }
      },
    );
  }

  beforeEach(() => {
    sendMessageMock = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
      },
    });
    mockVisualizerMessages();
  });

  it("should return a popup view with correct metadata", () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());

    expect(view.id).toBe("audio-visualizer-settings");
    expect(view.label).toBe("Audio Visualizer");
  });

  it("should render a heading", () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Audio Visualizer");
  });

  it("should render a toggle switch checked when enabled", async () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggle = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggle).not.toBeNull();
      expect(toggle?.checked).toBe(true);
      expect(toggle?.disabled).toBe(false);
    });
  });

  it("should query enabled state and style on render", () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-audio-visualizer-enabled" },
      expect.any(Function),
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-audio-visualizer-snapshot" },
      expect.any(Function),
    );
  });

  it("should send set-audio-visualizer-enabled on toggle change", async () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggle = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggle?.disabled).toBe(false);
    });

    const toggle = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-audio-visualizer-enabled",
      enabled: false,
    });
  });

  it("should render a style select with three options", () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    const select = getStyleSelect(container);
    expect(select).not.toBeNull();
    expect(select?.options).toHaveLength(3);
    expect(select?.options[0].value).toBe("bars");
    expect(select?.options[1].value).toBe("waveform");
    expect(select?.options[2].value).toBe("circular");
  });

  it("should set style select value from background", async () => {
    mockVisualizerMessages({ style: "waveform" });

    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = getStyleSelect(container);
      expect(select?.value).toBe("waveform");
      expect(select?.disabled).toBe(false);
    });
  });

  it("should send set-audio-visualizer-style on select change", async () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = getStyleSelect(container);
      expect(select?.disabled).toBe(false);
    });

    const select = getStyleSelect(container)!;
    select.value = "circular";
    select.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-audio-visualizer-style",
      style: "circular",
    });
  });

  it("should query target state on render", () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-audio-visualizer-snapshot" },
      expect.any(Function),
    );
  });

  it("should render a target select with five options", () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    const targetSelect = getTargetSelect(container);
    expect(targetSelect).not.toBeNull();
    expect(targetSelect?.options).toHaveLength(5);
    expect(targetSelect?.options[0].value).toBe("auto");
    expect(targetSelect?.options[1].value).toBe("all");
    expect(targetSelect?.options[2].value).toBe("pip-only");
    expect(targetSelect?.options[3].value).toBe("song-art-only");
    expect(targetSelect?.options[4].value).toBe("player-bar-only");
  });

  it("should set target select value from background", async () => {
    mockVisualizerMessages({ target: "pip-only" });

    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const targetSelect = getTargetSelect(container);
      expect(targetSelect?.value).toBe("pip-only");
      expect(targetSelect?.disabled).toBe(false);
    });
  });

  it("should send set-audio-visualizer-target on target select change", async () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const targetSelect = getTargetSelect(container);
      expect(targetSelect?.disabled).toBe(false);
    });

    const targetSelect = getTargetSelect(container)!;
    targetSelect.value = "all";
    targetSelect.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-audio-visualizer-target",
      target: "all",
    });
  });

  it("should query style tuning values on render", () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-audio-visualizer-snapshot" },
      expect.any(Function),
    );
  });

  it("should send style tuning update when slider changes", async () => {
    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");
    view.render(container);

    await vi.waitFor(() => {
      const ranges = container.querySelectorAll<HTMLInputElement>(
        'input[type="range"]',
      );
      expect(ranges).toHaveLength(3);
      expect(ranges[0]?.disabled).toBe(false);
    });

    const ranges = container.querySelectorAll<HTMLInputElement>(
      'input[type="range"]',
    );
    ranges[0].value = "140";
    ranges[0].dispatchEvent(new Event("input"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-audio-visualizer-style-tuning",
      style: "bars",
      tuning: {
        intensity: 1.4,
        thickness: 1,
        opacity: 1,
        colorMode: "white",
      },
    });
  });

  it("should send set-audio-visualizer-color-mode on color mode change", async () => {
    mockVisualizerMessages({
      tunings: {
        bars: {
          intensity: 1,
          thickness: 1,
          opacity: 1,
          colorMode: "white",
        },
        waveform: {
          intensity: 1,
          thickness: 1,
          opacity: 1,
          colorMode: "artwork-adaptive",
        },
        circular: {
          intensity: 1,
          thickness: 1,
          opacity: 1,
          colorMode: "monochrome-dim",
        },
      },
    });

    const view = createAudioVisualizerPopupView(createTestModuleContext());
    const container = document.createElement("div");
    view.render(container);

    await vi.waitFor(() => {
      const colorModeSelect = getColorModeSelect(container);
      expect(colorModeSelect?.disabled).toBe(false);
      expect(colorModeSelect?.value).toBe("white");
    });

    const colorModeSelect = getColorModeSelect(container)!;
    colorModeSelect.value = "monochrome-dim";
    colorModeSelect.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-audio-visualizer-color-mode",
      mode: "monochrome-dim",
    });
  });

  it("should bind controls through the injected module client", async () => {
    const client: AudioVisualizerClient = {
      isEnabled: vi.fn().mockResolvedValue(true),
      setEnabled: vi.fn().mockResolvedValue(undefined),
      getSnapshot: vi.fn().mockResolvedValue({
        enabled: true,
        style: "bars",
        target: "auto",
        tunings: {
          bars: { intensity: 1, thickness: 1, opacity: 1, colorMode: "white" },
          waveform: {
            intensity: 1,
            thickness: 1,
            opacity: 1,
            colorMode: "white",
          },
          circular: {
            intensity: 1,
            thickness: 1,
            opacity: 1,
            colorMode: "white",
          },
        },
      }),
      setStyle: vi.fn().mockResolvedValue(undefined),
      setTarget: vi.fn().mockResolvedValue(undefined),
      setStyleTuning: vi.fn().mockResolvedValue(undefined),
      setColorMode: vi.fn().mockResolvedValue(undefined),
    };
    const view = createAudioVisualizerPopupView(
      createTestModuleContext(),
      client,
    );
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggle = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggle?.disabled).toBe(false);
      expect(getStyleSelect(container)?.disabled).toBe(false);
    });

    const toggle = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    const styleSelect = getStyleSelect(container)!;
    styleSelect.value = "circular";
    styleSelect.dispatchEvent(new Event("change"));

    const targetSelect = getTargetSelect(container)!;
    targetSelect.value = "all";
    targetSelect.dispatchEvent(new Event("change"));

    const ranges = container.querySelectorAll<HTMLInputElement>(
      'input[type="range"]',
    );
    ranges[0].value = "140";
    ranges[0].dispatchEvent(new Event("input"));

    const colorModeSelect = getColorModeSelect(container)!;
    colorModeSelect.value = "monochrome-dim";
    colorModeSelect.dispatchEvent(new Event("change"));

    expect(client.isEnabled).toHaveBeenCalled();
    expect(client.getSnapshot).toHaveBeenCalled();
    expect(client.setEnabled).toHaveBeenCalledWith(false);
    expect(client.setStyle).toHaveBeenCalledWith("circular");
    expect(client.setTarget).toHaveBeenCalledWith("all");
    expect(client.setStyleTuning).toHaveBeenCalledWith("circular", {
      intensity: 1.4,
      thickness: 1,
      opacity: 1,
      colorMode: "white",
    });
    expect(client.setColorMode).toHaveBeenCalledWith("monochrome-dim");
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

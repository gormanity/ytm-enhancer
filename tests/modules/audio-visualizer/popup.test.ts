import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAudioVisualizerPopupView } from "@/modules/audio-visualizer/popup";

describe("audio visualizer popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
      },
    });
  });

  it("should return a popup view with correct metadata", () => {
    const view = createAudioVisualizerPopupView();

    expect(view.id).toBe("audio-visualizer-settings");
    expect(view.label).toBe("Audio Visualizer");
  });

  it("should render a heading", () => {
    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Audio Visualizer");
  });

  it("should render a toggle switch checked when enabled", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (callback) {
          if (message.type === "get-audio-visualizer-enabled") {
            callback({ ok: true, data: true });
          } else if (message.type === "get-audio-visualizer-style") {
            callback({ ok: true, data: "bars" });
          } else if (message.type === "get-audio-visualizer-target") {
            callback({ ok: true, data: "auto" });
          }
        }
      },
    );

    const view = createAudioVisualizerPopupView();
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
    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-audio-visualizer-enabled" },
      expect.any(Function),
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-audio-visualizer-style" },
      expect.any(Function),
    );
  });

  it("should send set-audio-visualizer-enabled on toggle change", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (callback) {
          if (message.type === "get-audio-visualizer-enabled") {
            callback({ ok: true, data: true });
          } else if (message.type === "get-audio-visualizer-style") {
            callback({ ok: true, data: "bars" });
          } else if (message.type === "get-audio-visualizer-target") {
            callback({ ok: true, data: "auto" });
          }
        }
      },
    );

    const view = createAudioVisualizerPopupView();
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
    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    const selects = container.querySelectorAll("select");
    const select = selects[0];
    expect(select).not.toBeNull();
    expect(select?.options).toHaveLength(3);
    expect(select?.options[0].value).toBe("bars");
    expect(select?.options[1].value).toBe("waveform");
    expect(select?.options[2].value).toBe("circular");
  });

  it("should set style select value from background", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (callback) {
          if (message.type === "get-audio-visualizer-enabled") {
            callback({ ok: true, data: true });
          } else if (message.type === "get-audio-visualizer-style") {
            callback({ ok: true, data: "waveform" });
          } else if (message.type === "get-audio-visualizer-target") {
            callback({ ok: true, data: "auto" });
          }
        }
      },
    );

    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const selects = container.querySelectorAll<HTMLSelectElement>("select");
      expect(selects[0]?.value).toBe("waveform");
      expect(selects[0]?.disabled).toBe(false);
    });
  });

  it("should send set-audio-visualizer-style on select change", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (callback) {
          if (message.type === "get-audio-visualizer-enabled") {
            callback({ ok: true, data: true });
          } else if (message.type === "get-audio-visualizer-style") {
            callback({ ok: true, data: "bars" });
          } else if (message.type === "get-audio-visualizer-target") {
            callback({ ok: true, data: "auto" });
          }
        }
      },
    );

    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const selects = container.querySelectorAll<HTMLSelectElement>("select");
      expect(selects[0]?.disabled).toBe(false);
    });

    const selects = container.querySelectorAll<HTMLSelectElement>("select");
    selects[0].value = "circular";
    selects[0].dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-audio-visualizer-style",
      style: "circular",
    });
  });

  it("should query target state on render", () => {
    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-audio-visualizer-target" },
      expect.any(Function),
    );
  });

  it("should render a target select with five options", () => {
    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    const selects = container.querySelectorAll("select");
    const targetSelect = selects[1];
    expect(targetSelect).not.toBeNull();
    expect(targetSelect?.options).toHaveLength(5);
    expect(targetSelect?.options[0].value).toBe("auto");
    expect(targetSelect?.options[1].value).toBe("all");
    expect(targetSelect?.options[2].value).toBe("pip-only");
    expect(targetSelect?.options[3].value).toBe("song-art-only");
    expect(targetSelect?.options[4].value).toBe("player-bar-only");
  });

  it("should set target select value from background", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (callback) {
          if (message.type === "get-audio-visualizer-enabled") {
            callback({ ok: true, data: true });
          } else if (message.type === "get-audio-visualizer-style") {
            callback({ ok: true, data: "bars" });
          } else if (message.type === "get-audio-visualizer-target") {
            callback({ ok: true, data: "pip-only" });
          }
        }
      },
    );

    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const selects = container.querySelectorAll<HTMLSelectElement>("select");
      expect(selects[1]?.value).toBe("pip-only");
      expect(selects[1]?.disabled).toBe(false);
    });
  });

  it("should send set-audio-visualizer-target on target select change", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (callback) {
          if (message.type === "get-audio-visualizer-enabled") {
            callback({ ok: true, data: true });
          } else if (message.type === "get-audio-visualizer-style") {
            callback({ ok: true, data: "bars" });
          } else if (message.type === "get-audio-visualizer-target") {
            callback({ ok: true, data: "auto" });
          }
        }
      },
    );

    const view = createAudioVisualizerPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const selects = container.querySelectorAll<HTMLSelectElement>("select");
      expect(selects[1]?.disabled).toBe(false);
    });

    const selects = container.querySelectorAll<HTMLSelectElement>("select");
    selects[1].value = "all";
    selects[1].dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-audio-visualizer-target",
      target: "all",
    });
  });
});

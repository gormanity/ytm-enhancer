import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VisualizerOverlayManager } from "@/modules/audio-visualizer/overlay-manager";
import { VisualizerCanvas } from "@/modules/audio-visualizer/visualizer-canvas";

vi.mock("@/modules/audio-visualizer/visualizer-canvas", () => {
  const VisualizerCanvas = vi.fn();
  VisualizerCanvas.prototype.attach = vi.fn();
  VisualizerCanvas.prototype.start = vi.fn();
  VisualizerCanvas.prototype.stop = vi.fn();
  VisualizerCanvas.prototype.destroy = vi.fn();
  VisualizerCanvas.prototype.setStyle = vi.fn();
  VisualizerCanvas.prototype.updateFrequencyData = vi.fn();
  return { VisualizerCanvas };
});

describe("VisualizerOverlayManager", () => {
  let manager: VisualizerOverlayManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new VisualizerOverlayManager();
  });

  afterEach(() => {
    manager.destroyAll();
    document.body.innerHTML = "";
  });

  it("should attach a canvas to the player bar container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    manager.attachToPlayerBar(container);

    expect(VisualizerCanvas).toHaveBeenCalledTimes(1);
    expect(VisualizerCanvas.prototype.attach).toHaveBeenCalledWith(container);
  });

  it("should attach a canvas to the song art container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    manager.attachToSongArt(container);

    expect(VisualizerCanvas).toHaveBeenCalledTimes(1);
    expect(VisualizerCanvas.prototype.attach).toHaveBeenCalledWith(container);
  });

  it("should attach a canvas to PiP container", () => {
    const container = document.createElement("div");

    manager.attachToPip(container);

    expect(VisualizerCanvas).toHaveBeenCalledTimes(1);
    expect(VisualizerCanvas.prototype.attach).toHaveBeenCalledWith(container);
  });

  it("should detach PiP canvas on detachPip", () => {
    const container = document.createElement("div");
    manager.attachToPip(container);
    manager.detachPip();

    expect(VisualizerCanvas.prototype.destroy).toHaveBeenCalledTimes(1);
  });

  it("should fan out frequency data to all canvases", () => {
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    document.body.appendChild(c1);
    document.body.appendChild(c2);

    manager.attachToPlayerBar(c1);
    manager.attachToSongArt(c2);

    const data = new Uint8Array([128, 64]);
    manager.updateFrequencyData(data);

    expect(
      VisualizerCanvas.prototype.updateFrequencyData,
    ).toHaveBeenCalledTimes(2);
  });

  it("should set style on all canvases", () => {
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    document.body.appendChild(c1);
    document.body.appendChild(c2);

    manager.attachToPlayerBar(c1);
    manager.attachToSongArt(c2);

    vi.mocked(VisualizerCanvas.prototype.setStyle).mockClear();
    manager.setStyle("waveform");

    expect(VisualizerCanvas.prototype.setStyle).toHaveBeenCalledWith(
      "waveform",
    );
    // Called twice — once per canvas (excluding initial attach calls)
    expect(VisualizerCanvas.prototype.setStyle).toHaveBeenCalledTimes(2);
  });

  it("should start all canvases", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);

    manager.attachToPlayerBar(c1);
    manager.startAll();

    expect(VisualizerCanvas.prototype.start).toHaveBeenCalledTimes(1);
  });

  it("should stop all canvases", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);

    manager.attachToPlayerBar(c1);
    manager.stopAll();

    expect(VisualizerCanvas.prototype.stop).toHaveBeenCalledTimes(1);
  });

  it("should destroy all canvases", () => {
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    const c3 = document.createElement("div");
    document.body.appendChild(c1);
    document.body.appendChild(c2);

    manager.attachToPlayerBar(c1);
    manager.attachToSongArt(c2);
    manager.attachToPip(c3);
    manager.destroyAll();

    expect(VisualizerCanvas.prototype.destroy).toHaveBeenCalledTimes(3);
  });

  it("should auto-start PiP canvas when attached after startAll", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);
    manager.attachToPlayerBar(c1);
    manager.startAll();

    vi.mocked(VisualizerCanvas.prototype.start).mockClear();

    const pipContainer = document.createElement("div");
    manager.attachToPip(pipContainer);

    expect(VisualizerCanvas.prototype.start).toHaveBeenCalledTimes(1);
  });

  it("should not auto-start PiP canvas when not running", () => {
    const pipContainer = document.createElement("div");
    manager.attachToPip(pipContainer);

    expect(VisualizerCanvas.prototype.start).not.toHaveBeenCalled();
  });

  it("should not auto-start after stopAll", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);
    manager.attachToPlayerBar(c1);
    manager.startAll();
    manager.stopAll();

    vi.mocked(VisualizerCanvas.prototype.start).mockClear();

    const pipContainer = document.createElement("div");
    manager.attachToPip(pipContainer);

    expect(VisualizerCanvas.prototype.start).not.toHaveBeenCalled();
  });

  it("should not auto-start after destroyAll", () => {
    const c1 = document.createElement("div");
    document.body.appendChild(c1);
    manager.attachToPlayerBar(c1);
    manager.startAll();
    manager.destroyAll();

    vi.mocked(VisualizerCanvas.prototype.start).mockClear();

    const pipContainer = document.createElement("div");
    manager.attachToPip(pipContainer);

    expect(VisualizerCanvas.prototype.start).not.toHaveBeenCalled();
  });

  it("should apply current style to newly attached canvases", () => {
    manager.setStyle("circular");

    const c = document.createElement("div");
    document.body.appendChild(c);
    manager.attachToPlayerBar(c);

    expect(VisualizerCanvas.prototype.setStyle).toHaveBeenCalledWith(
      "circular",
    );
  });
});

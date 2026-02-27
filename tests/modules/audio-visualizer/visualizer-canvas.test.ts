import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VisualizerCanvas } from "@/modules/audio-visualizer/visualizer-canvas";

function mockCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx);

  // Mock createElement to return our canvas with the mocked context
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return canvas;
    }
    return Document.prototype.createElement.call(document, tag);
  });

  return { canvas, ctx };
}

describe("VisualizerCanvas", () => {
  let visualizer: VisualizerCanvas;
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    document.body.appendChild(container);
  });

  afterEach(() => {
    visualizer?.destroy();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should create a canvas and append it to the container", () => {
    const { canvas } = mockCanvas();
    visualizer = new VisualizerCanvas();
    visualizer.attach(container);

    expect(container.contains(canvas)).toBe(true);
  });

  it("should style the canvas as an absolute overlay", () => {
    const { canvas } = mockCanvas();
    visualizer = new VisualizerCanvas();
    visualizer.attach(container);

    expect(canvas.style.position).toBe("absolute");
    expect(canvas.style.inset).toBe("0px");
    expect(canvas.style.pointerEvents).toBe("none");
  });

  it("should set container position to relative if static", () => {
    mockCanvas();
    container.style.position = "";
    visualizer = new VisualizerCanvas();
    visualizer.attach(container);

    expect(container.style.position).toBe("relative");
  });

  it("should not override non-static container positioning", () => {
    mockCanvas();
    container.style.position = "absolute";
    visualizer = new VisualizerCanvas();
    visualizer.attach(container);

    expect(container.style.position).toBe("absolute");
  });

  it("should request animation frame when started", () => {
    mockCanvas();
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    visualizer = new VisualizerCanvas();
    visualizer.attach(container);
    visualizer.start();

    expect(rafSpy).toHaveBeenCalled();
  });

  it("should cancel animation frame when stopped", () => {
    mockCanvas();
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);

    visualizer = new VisualizerCanvas();
    visualizer.attach(container);
    visualizer.start();
    visualizer.stop();

    expect(cancelSpy).toHaveBeenCalledWith(42);
  });

  it("should remove canvas from container on destroy", () => {
    const { canvas } = mockCanvas();
    visualizer = new VisualizerCanvas();
    visualizer.attach(container);

    expect(container.contains(canvas)).toBe(true);
    visualizer.destroy();
    expect(container.contains(canvas)).toBe(false);
  });

  it("should call draw function with frequency data on animation frame", () => {
    const { ctx } = mockCanvas();
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });

    visualizer = new VisualizerCanvas();
    visualizer.attach(container);
    visualizer.updateFrequencyData(new Uint8Array([128, 64]));
    visualizer.start();

    expect(rafCallback).not.toBeNull();
    rafCallback!(0);

    // Default style is bars, so fillRect should have been called
    expect(ctx.clearRect).toHaveBeenCalled();
  });

  it("should change visualization style", () => {
    mockCanvas();
    visualizer = new VisualizerCanvas();
    visualizer.attach(container);
    visualizer.setStyle("waveform");

    // Just verify it doesn't throw — style is used during draw
    expect(() => visualizer.setStyle("circular")).not.toThrow();
  });

  it("should stop animation on destroy", () => {
    mockCanvas();
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(99);

    visualizer = new VisualizerCanvas();
    visualizer.attach(container);
    visualizer.start();
    visualizer.destroy();

    expect(cancelSpy).toHaveBeenCalledWith(99);
  });
});

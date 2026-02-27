import { describe, it, expect, vi } from "vitest";
import {
  drawBars,
  drawWaveform,
  drawCircular,
  STYLE_RENDERERS,
  type VisualizerStyle,
  type VisualizerDrawContext,
} from "@/modules/audio-visualizer/styles";

function createMockContext(width = 200, height = 200): VisualizerDrawContext {
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

  return { ctx, width, height, data: new Uint8Array([128, 64, 192, 255, 0]) };
}

describe("drawBars", () => {
  it("should clear the canvas before drawing", () => {
    const drawCtx = createMockContext();
    drawBars(drawCtx);
    expect(drawCtx.ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 200);
  });

  it("should draw a rectangle for each frequency bin", () => {
    const drawCtx = createMockContext();
    drawBars(drawCtx);
    expect(drawCtx.ctx.fillRect).toHaveBeenCalledTimes(5);
  });

  it("should not draw when data is empty", () => {
    const drawCtx = createMockContext();
    drawCtx.data = new Uint8Array(0);
    drawBars(drawCtx);
    expect(drawCtx.ctx.fillRect).not.toHaveBeenCalled();
  });
});

describe("drawWaveform", () => {
  it("should clear the canvas before drawing", () => {
    const drawCtx = createMockContext();
    drawWaveform(drawCtx);
    expect(drawCtx.ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 200);
  });

  it("should draw a path using lineTo for each data point", () => {
    const drawCtx = createMockContext();
    drawWaveform(drawCtx);
    expect(drawCtx.ctx.beginPath).toHaveBeenCalled();
    expect(drawCtx.ctx.moveTo).toHaveBeenCalled();
    // One lineTo per remaining data point after the first moveTo
    expect(drawCtx.ctx.lineTo).toHaveBeenCalledTimes(4);
    expect(drawCtx.ctx.stroke).toHaveBeenCalled();
  });

  it("should not draw when data is empty", () => {
    const drawCtx = createMockContext();
    drawCtx.data = new Uint8Array(0);
    drawWaveform(drawCtx);
    expect(drawCtx.ctx.beginPath).not.toHaveBeenCalled();
  });
});

describe("drawCircular", () => {
  it("should clear the canvas before drawing", () => {
    const drawCtx = createMockContext();
    drawCircular(drawCtx);
    expect(drawCtx.ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 200);
  });

  it("should draw lines radiating from center for each bin", () => {
    const drawCtx = createMockContext();
    drawCircular(drawCtx);
    expect(drawCtx.ctx.beginPath).toHaveBeenCalled();
    // Each bin: moveTo + lineTo
    expect(drawCtx.ctx.moveTo).toHaveBeenCalledTimes(5);
    expect(drawCtx.ctx.lineTo).toHaveBeenCalledTimes(5);
    expect(drawCtx.ctx.stroke).toHaveBeenCalled();
  });

  it("should not draw when data is empty", () => {
    const drawCtx = createMockContext();
    drawCtx.data = new Uint8Array(0);
    drawCircular(drawCtx);
    expect(drawCtx.ctx.beginPath).not.toHaveBeenCalled();
  });
});

describe("STYLE_RENDERERS", () => {
  it("should map bars to drawBars", () => {
    expect(STYLE_RENDERERS.bars).toBe(drawBars);
  });

  it("should map waveform to drawWaveform", () => {
    expect(STYLE_RENDERERS.waveform).toBe(drawWaveform);
  });

  it("should map circular to drawCircular", () => {
    expect(STYLE_RENDERERS.circular).toBe(drawCircular);
  });

  it("should have exactly three styles", () => {
    const keys = Object.keys(STYLE_RENDERERS) as VisualizerStyle[];
    expect(keys).toHaveLength(3);
  });
});

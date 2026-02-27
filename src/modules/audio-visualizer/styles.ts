export type VisualizerStyle = "bars" | "waveform" | "circular";

export interface VisualizerDrawContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  data: Uint8Array;
}

export function drawBars({
  ctx,
  width,
  height,
  data,
}: VisualizerDrawContext): void {
  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;

  const barWidth = width / data.length;
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";

  for (let i = 0; i < data.length; i++) {
    const barHeight = (data[i] / 255) * height;
    ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
  }
}

export function drawWaveform({
  ctx,
  width,
  height,
  data,
}: VisualizerDrawContext): void {
  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;

  const sliceWidth = width / (data.length - 1);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  const firstY = height - (data[0] / 255) * height;
  ctx.moveTo(0, firstY);

  for (let i = 1; i < data.length; i++) {
    const y = height - (data[i] / 255) * height;
    ctx.lineTo(i * sliceWidth, y);
  }

  ctx.stroke();
}

export function drawCircular({
  ctx,
  width,
  height,
  data,
}: VisualizerDrawContext): void {
  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;

  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.25;
  const maxExtension = Math.min(width, height) * 0.2;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
    const extension = (data[i] / 255) * maxExtension;
    const innerX = centerX + Math.cos(angle) * baseRadius;
    const innerY = centerY + Math.sin(angle) * baseRadius;
    const outerX = centerX + Math.cos(angle) * (baseRadius + extension);
    const outerY = centerY + Math.sin(angle) * (baseRadius + extension);

    ctx.moveTo(innerX, innerY);
    ctx.lineTo(outerX, outerY);
  }
  ctx.stroke();
}

export const STYLE_RENDERERS: Record<
  VisualizerStyle,
  (drawCtx: VisualizerDrawContext) => void
> = {
  bars: drawBars,
  waveform: drawWaveform,
  circular: drawCircular,
};

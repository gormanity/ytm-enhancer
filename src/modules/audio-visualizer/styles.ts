export type VisualizerStyle = "bars" | "waveform" | "circular";
export type VisualizerColorMode =
  | "white"
  | "artwork-adaptive"
  | "monochrome-dim";

export type VisualizerTarget =
  | "auto"
  | "all"
  | "pip-only"
  | "song-art-only"
  | "player-bar-only";

export interface VisualizerStyleTuning {
  intensity: number;
  thickness: number;
  opacity: number;
}

export type VisualizerStyleTunings = Record<
  VisualizerStyle,
  VisualizerStyleTuning
>;

export const DEFAULT_VISUALIZER_STYLE_TUNING: VisualizerStyleTuning = {
  intensity: 1,
  thickness: 1,
  opacity: 1,
};

export const DEFAULT_VISUALIZER_STYLE_TUNINGS: VisualizerStyleTunings = {
  bars: { ...DEFAULT_VISUALIZER_STYLE_TUNING },
  waveform: { ...DEFAULT_VISUALIZER_STYLE_TUNING },
  circular: { ...DEFAULT_VISUALIZER_STYLE_TUNING },
};

export interface VisualizerDrawContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  data: Uint8Array;
  tuning: VisualizerStyleTuning;
  color: { r: number; g: number; b: number };
}

function clampTuning(tuning: VisualizerStyleTuning): VisualizerStyleTuning {
  return {
    intensity: Math.max(0.25, Math.min(2, tuning.intensity)),
    thickness: Math.max(0.5, Math.min(2.5, tuning.thickness)),
    opacity: Math.max(0.1, Math.min(1, tuning.opacity)),
  };
}

export function drawBars({
  ctx,
  width,
  height,
  data,
  tuning,
  color,
}: VisualizerDrawContext): void {
  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;
  const clamped = clampTuning(tuning);

  const barWidth = width / data.length;
  const barWidthPx = Math.max(1, barWidth * 0.7 * clamped.thickness);
  const alpha = 0.6 * clamped.opacity;
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

  for (let i = 0; i < data.length; i++) {
    const rawBarHeight = ((data[i] / 255) * height * clamped.intensity) / 1.15;
    const barHeight = Math.max(0, Math.min(height, rawBarHeight));
    const x = i * barWidth + (barWidth - barWidthPx) / 2;
    ctx.fillRect(x, height - barHeight, barWidthPx, barHeight);
  }
}

export function drawWaveform({
  ctx,
  width,
  height,
  data,
  tuning,
  color,
}: VisualizerDrawContext): void {
  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;
  const clamped = clampTuning(tuning);

  const sliceWidth = width / (data.length - 1);
  ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.6 * clamped.opacity})`;
  ctx.lineWidth = 2 * clamped.thickness;

  ctx.beginPath();
  const firstY = height - ((data[0] / 255) * height * clamped.intensity) / 1.15;
  ctx.moveTo(0, firstY);

  for (let i = 1; i < data.length; i++) {
    const y = height - ((data[i] / 255) * height * clamped.intensity) / 1.15;
    ctx.lineTo(i * sliceWidth, y);
  }

  ctx.stroke();
}

export function drawCircular({
  ctx,
  width,
  height,
  data,
  tuning,
  color,
}: VisualizerDrawContext): void {
  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;
  const clamped = clampTuning(tuning);

  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.25;
  const maxExtension = Math.min(width, height) * 0.2 * clamped.intensity;

  ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.6 * clamped.opacity})`;
  ctx.lineWidth = 2 * clamped.thickness;

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

import type { RuntimeClient } from "@/core/messaging";
import type {
  VisualizerColorMode,
  VisualizerStyle,
  VisualizerStyleTuning,
  VisualizerStyleTunings,
  VisualizerTarget,
} from "./styles";

export interface AudioVisualizerSnapshot {
  enabled: boolean;
  style: VisualizerStyle;
  target: VisualizerTarget;
  tunings: VisualizerStyleTunings;
}

export interface AudioVisualizerClient {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
  getSnapshot(): Promise<AudioVisualizerSnapshot>;
  setStyle(style: VisualizerStyle): Promise<void>;
  setTarget(target: VisualizerTarget): Promise<void>;
  setStyleTuning(
    style: VisualizerStyle,
    tuning: VisualizerStyleTuning,
  ): Promise<void>;
  setColorMode(mode: VisualizerColorMode): Promise<void>;
}

export function createAudioVisualizerClient(
  runtime: RuntimeClient,
): AudioVisualizerClient {
  return {
    isEnabled: () =>
      runtime.request<boolean>({ type: "get-audio-visualizer-enabled" }),
    setEnabled: (enabled) =>
      runtime.command({
        type: "set-audio-visualizer-enabled",
        enabled,
      }),
    getSnapshot: () =>
      runtime.request<AudioVisualizerSnapshot>({
        type: "get-audio-visualizer-snapshot",
      }),
    setStyle: (style) =>
      runtime.command({
        type: "set-audio-visualizer-style",
        style,
      }),
    setTarget: (target) =>
      runtime.command({
        type: "set-audio-visualizer-target",
        target,
      }),
    setStyleTuning: (style, tuning) =>
      runtime.command({
        type: "set-audio-visualizer-style-tuning",
        style,
        tuning,
      }),
    setColorMode: (mode) =>
      runtime.command({
        type: "set-audio-visualizer-color-mode",
        mode,
      }),
  };
}

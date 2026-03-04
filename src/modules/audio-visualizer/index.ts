import type { FeatureModule, PopupView } from "@/core/types";
import {
  DEFAULT_VISUALIZER_STYLE_TUNING,
  DEFAULT_VISUALIZER_STYLE_TUNINGS,
  type VisualizerColorMode,
  type VisualizerStyle,
  type VisualizerStyleTuning,
  type VisualizerStyleTunings,
  type VisualizerTarget,
} from "./styles";
import { createAudioVisualizerPopupView } from "./popup";

export class AudioVisualizerModule implements FeatureModule {
  readonly id = "audio-visualizer";
  readonly name = "Audio Visualizer";
  readonly description =
    "Real-time audio visualization overlaid on album artwork";

  private enabled = true;
  private style: VisualizerStyle = "bars";
  private target: VisualizerTarget = "auto";
  private colorMode: VisualizerColorMode = "white";
  private styleTunings: VisualizerStyleTunings = {
    bars: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.bars },
    waveform: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.waveform },
    circular: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.circular },
  };

  init(): void {
    // No background-side setup needed; visualization runs in the content script.
  }

  destroy(): void {
    // Nothing to clean up on the background side.
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getStyle(): VisualizerStyle {
    return this.style;
  }

  setStyle(style: VisualizerStyle): void {
    this.style = style;
  }

  getTarget(): VisualizerTarget {
    return this.target;
  }

  setTarget(target: VisualizerTarget): void {
    this.target = target;
  }

  getColorMode(): VisualizerColorMode {
    return this.colorMode;
  }

  setColorMode(mode: VisualizerColorMode): void {
    this.colorMode = mode;
  }

  getStyleTunings(): VisualizerStyleTunings {
    return {
      bars: { ...this.styleTunings.bars },
      waveform: { ...this.styleTunings.waveform },
      circular: { ...this.styleTunings.circular },
    };
  }

  setStyleTuning(style: VisualizerStyle, tuning: VisualizerStyleTuning): void {
    this.styleTunings = {
      ...this.styleTunings,
      [style]: this.normalizeTuning(tuning),
    };
  }

  setStyleTunings(tunings: VisualizerStyleTunings): void {
    this.styleTunings = {
      bars: this.normalizeTuning(tunings.bars),
      waveform: this.normalizeTuning(tunings.waveform),
      circular: this.normalizeTuning(tunings.circular),
    };
  }

  private normalizeTuning(
    tuning: Partial<VisualizerStyleTuning> | undefined,
  ): VisualizerStyleTuning {
    const defaultTuning = DEFAULT_VISUALIZER_STYLE_TUNING;
    return {
      intensity:
        typeof tuning?.intensity === "number"
          ? tuning.intensity
          : defaultTuning.intensity,
      thickness:
        typeof tuning?.thickness === "number"
          ? tuning.thickness
          : defaultTuning.thickness,
      opacity:
        typeof tuning?.opacity === "number"
          ? tuning.opacity
          : defaultTuning.opacity,
    };
  }

  getPopupViews(): PopupView[] {
    return [createAudioVisualizerPopupView()];
  }
}

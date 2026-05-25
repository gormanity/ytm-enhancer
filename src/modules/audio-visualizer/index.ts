import type { FeatureModule, ModuleContext, PopupView } from "@/core/types";
import type { ModuleHandlerRegistry } from "@/core/messaging";
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
    return this.styleTunings[this.style].colorMode;
  }

  setColorMode(mode: VisualizerColorMode): void {
    const current = this.styleTunings[this.style];
    this.styleTunings = {
      ...this.styleTunings,
      [this.style]: {
        ...this.normalizeTuning(current),
        colorMode: mode,
      },
    };
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

  setStyleTunings(
    tunings: VisualizerStyleTunings,
    fallbackColorMode: VisualizerColorMode = "white",
  ): void {
    this.styleTunings = {
      bars: this.normalizeTuning(tunings.bars, fallbackColorMode),
      waveform: this.normalizeTuning(tunings.waveform, fallbackColorMode),
      circular: this.normalizeTuning(tunings.circular, fallbackColorMode),
    };
  }

  setAllStyleColorModes(mode: VisualizerColorMode): void {
    this.styleTunings = {
      bars: this.normalizeTuning(this.styleTunings.bars, mode),
      waveform: this.normalizeTuning(this.styleTunings.waveform, mode),
      circular: this.normalizeTuning(this.styleTunings.circular, mode),
    };
  }

  private normalizeTuning(
    tuning: Partial<VisualizerStyleTuning> | undefined,
    fallbackColorMode: VisualizerColorMode = "white",
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
      colorMode:
        tuning?.colorMode === "white" ||
        tuning?.colorMode === "artwork-adaptive" ||
        tuning?.colorMode === "monochrome-dim"
          ? tuning.colorMode
          : fallbackColorMode,
    };
  }

  getPopupViews(context: ModuleContext): PopupView[] {
    return [createAudioVisualizerPopupView(context)];
  }

  registerHandlers(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void {
    registry.on("get-audio-visualizer-enabled", async () => ({
      ok: true,
      data: this.isEnabled(),
    }));
    registry.on("set-audio-visualizer-enabled", async (message) => {
      this.setEnabled(message.enabled as boolean);
      void context.state.saveValue("audio-visualizer.enabled", message.enabled);
      void context.ytm.broadcast({
        type: "set-audio-visualizer-enabled",
        enabled: message.enabled,
      });
      return { ok: true };
    });
    registry.on("get-audio-visualizer-snapshot", async () => ({
      ok: true,
      data: this.getSnapshot(),
    }));
    registry.on("get-audio-visualizer-style", async () => ({
      ok: true,
      data: this.getStyle(),
    }));
    registry.on("set-audio-visualizer-style", async (message) => {
      this.setStyle(message.style as VisualizerStyle);
      void context.state.saveValue("audio-visualizer.style", message.style);
      void context.ytm.broadcast({
        type: "set-audio-visualizer-style",
        style: message.style,
      });
      void context.ytm.broadcast({
        type: "set-audio-visualizer-color-mode",
        mode: this.getColorMode(),
      });
      return { ok: true };
    });
    registry.on("get-audio-visualizer-target", async () => ({
      ok: true,
      data: this.getTarget(),
    }));
    registry.on("set-audio-visualizer-target", async (message) => {
      this.setTarget(message.target as VisualizerTarget);
      void context.state.saveValue("audio-visualizer.target", message.target);
      void context.ytm.broadcast({
        type: "set-audio-visualizer-target",
        target: message.target,
      });
      return { ok: true };
    });
    registry.on("get-audio-visualizer-style-tunings", async () => ({
      ok: true,
      data: this.getStyleTunings(),
    }));
    registry.on("set-audio-visualizer-style-tuning", async (message) => {
      this.setStyleTuning(
        message.style as VisualizerStyle,
        message.tuning as VisualizerStyleTuning,
      );
      const tunings = this.getStyleTunings();
      void context.state.saveValue("audio-visualizer.styleTunings", tunings);
      void context.ytm.broadcast({
        type: "set-audio-visualizer-style-tunings",
        tunings,
      });
      return { ok: true };
    });
    registry.on("get-audio-visualizer-color-mode", async () => ({
      ok: true,
      data: this.getColorMode(),
    }));
    registry.on("set-audio-visualizer-color-mode", async (message) => {
      this.setColorMode(message.mode as VisualizerColorMode);
      void context.state.saveValue(
        "audio-visualizer.styleTunings",
        this.getStyleTunings(),
      );
      void context.ytm.broadcast({
        type: "set-audio-visualizer-color-mode",
        mode: message.mode,
      });
      return { ok: true };
    });
  }

  getSnapshot(): {
    enabled: boolean;
    style: VisualizerStyle;
    target: VisualizerTarget;
    tunings: VisualizerStyleTunings;
  } {
    return {
      enabled: this.isEnabled(),
      style: this.getStyle(),
      target: this.getTarget(),
      tunings: this.getStyleTunings(),
    };
  }
}

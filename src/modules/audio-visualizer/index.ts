import type { FeatureModule, PopupView } from "@/core/types";
import type { VisualizerStyle, VisualizerTarget } from "./styles";
import { createAudioVisualizerPopupView } from "./popup";

export class AudioVisualizerModule implements FeatureModule {
  readonly id = "audio-visualizer";
  readonly name = "Audio Visualizer";
  readonly description =
    "Real-time audio visualization overlaid on album artwork";

  private enabled = true;
  private style: VisualizerStyle = "bars";
  private target: VisualizerTarget = "auto";

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

  getPopupViews(): PopupView[] {
    return [createAudioVisualizerPopupView()];
  }
}

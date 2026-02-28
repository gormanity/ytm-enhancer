import type { FeatureModule, PopupView } from "@/core/types";
import { createStreamQualityPopupView } from "./popup";

export class StreamQualityModule implements FeatureModule {
  readonly id = "stream-quality";
  readonly name = "Stream Quality";
  readonly description = "Pick the audio/video stream quality level";

  private enabled = true;

  init(): void {}

  destroy(): void {}

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getPopupViews(): PopupView[] {
    return [createStreamQualityPopupView()];
  }
}

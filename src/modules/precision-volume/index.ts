import type { FeatureModule, PopupView } from "@/core/types";
import { createPrecisionVolumePopupView } from "./popup";

export class PrecisionVolumeModule implements FeatureModule {
  readonly id = "precision-volume";
  readonly name = "Precision Volume";
  readonly description = "Set exact playback volume from the extension popup";

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
    return [createPrecisionVolumePopupView()];
  }
}

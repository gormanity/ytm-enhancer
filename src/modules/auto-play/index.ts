import type { FeatureModule, PopupView } from "@/core/types";
import { createAutoPlayPopupView } from "./popup";

export class AutoPlayModule implements FeatureModule {
  readonly id = "auto-play";
  readonly name = "Auto-Play";
  readonly description = "Automatically start playback when YouTube Music loads";

  private enabled = false;

  init(): void {
    // No background-side setup needed; auto-play logic runs in
    // the content script.
  }

  destroy(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getPopupViews(): PopupView[] {
    return [createAutoPlayPopupView()];
  }
}

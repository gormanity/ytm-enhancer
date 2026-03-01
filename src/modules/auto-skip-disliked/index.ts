import type { FeatureModule, PopupView } from "@/core/types";
import { createAutoSkipDislikedPopupView } from "./popup";

export class AutoSkipDislikedModule implements FeatureModule {
  readonly id = "auto-skip-disliked";
  readonly name = "Auto-Skip Disliked";
  readonly description = "Automatically skip disliked songs during playback";

  private enabled = false;

  init(): void {
    // No background-side setup needed; skip logic runs in the
    // content script via the track observer callback.
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
    return [createAutoSkipDislikedPopupView()];
  }
}

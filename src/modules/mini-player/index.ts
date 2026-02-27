import type { FeatureModule, PopupView } from "@/core/types";
import { createMiniPlayerPopupView } from "./popup";

export class MiniPlayerModule implements FeatureModule {
  readonly id = "mini-player";
  readonly name = "Mini Player";
  readonly description = "Picture-in-Picture mini player with playback controls";

  private enabled = true;

  init(): void {
    // No background-side setup needed; the mini player is controlled
    // from the content script.
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

  getPopupViews(): PopupView[] {
    return [createMiniPlayerPopupView()];
  }
}

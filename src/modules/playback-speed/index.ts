import type { FeatureModule, PopupView } from "@/core/types";
import { createPlaybackSpeedPopupView } from "./popup";

export class PlaybackSpeedModule implements FeatureModule {
  readonly id = "playback-speed";
  readonly name = "Playback Speed";
  readonly description = "Control playback speed from the extension popup";

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
    return [createPlaybackSpeedPopupView()];
  }
}

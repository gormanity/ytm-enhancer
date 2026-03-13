import type { FeatureModule, PopupView } from "@/core/types";
import { createPlaybackControlsPopupView } from "./popup";

export class PlaybackControlsModule implements FeatureModule {
  readonly id = "playback-controls";
  readonly name = "Playback Controls";
  readonly description =
    "Now playing, volume, speed, quality, and tab management";

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
    return [createPlaybackControlsPopupView()];
  }
}

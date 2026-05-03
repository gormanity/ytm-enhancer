import type { AutoPlayMode, FeatureModule, PopupView } from "@/core/types";
import { createAutoPlayPopupView } from "./popup";

export class AutoPlayModule implements FeatureModule {
  readonly id = "auto-play";
  readonly name = "Auto-Play";
  readonly description =
    "Automatically start playback when YouTube Music loads";

  private mode: AutoPlayMode = "default";

  init(): void {
    // No background-side setup needed; auto-play logic runs in
    // the content script.
  }

  destroy(): void {
    this.mode = "default";
  }

  isEnabled(): boolean {
    return this.mode === "on";
  }

  setEnabled(enabled: boolean): void {
    this.mode = enabled ? "on" : "off";
  }

  getMode(): AutoPlayMode {
    return this.mode;
  }

  setMode(mode: AutoPlayMode): void {
    this.mode = mode;
  }

  getPopupViews(): PopupView[] {
    return [createAutoPlayPopupView()];
  }
}

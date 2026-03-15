import type { FeatureModule, PopupView } from "@/core/types";
import { createHotkeysPopupView } from "./popup";

export class HotkeysModule implements FeatureModule {
  readonly id = "hotkeys";
  readonly name = "Hotkeys";
  readonly description = "Configurable keyboard shortcuts for YouTube Music";

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
    return [createHotkeysPopupView()];
  }
}

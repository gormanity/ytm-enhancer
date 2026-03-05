import type { FeatureModule, PopupView } from "@/core/types";
import { createSleepTimerPopupView } from "./popup";

export class SleepTimerModule implements FeatureModule {
  readonly id = "sleep-timer";
  readonly name = "Sleep Timer";
  readonly description = "Pause playback after a selected duration";

  private enabled = true;

  init(): void {
    // Background timer lifecycle is managed centrally in the
    // background entrypoint.
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
    return [createSleepTimerPopupView()];
  }
}

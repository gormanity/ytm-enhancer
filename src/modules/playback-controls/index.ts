import { error } from "@/core/logger";
import type { HotkeyHandlerRegistry } from "@/core/hotkey-registry";
import type {
  FeatureModule,
  ModuleContext,
  PlaybackAction,
  PopupView,
} from "@/core/types";
import { createPlaybackControlsPopupView } from "./popup";

const COMMAND_ACTION_MAP: Record<string, PlaybackAction> = {
  "play-pause": "togglePlay",
  "next-track": "next",
  "previous-track": "previous",
};

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

  getPopupViews(context: ModuleContext): PopupView[] {
    return [createPlaybackControlsPopupView(context)];
  }

  registerHotkeys(
    registry: HotkeyHandlerRegistry,
    context: ModuleContext,
  ): void {
    for (const [command, action] of Object.entries(COMMAND_ACTION_MAP)) {
      registry.register(command, async () => {
        try {
          await context.ytm.executePlaybackAction(action);
        } catch (err) {
          error("Hotkey action failed:", err);
        }
      });
    }
  }
}

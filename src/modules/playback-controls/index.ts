import { error } from "@/core/logger";
import type { HotkeyHandlerRegistry } from "@/core/hotkey-registry";
import {
  createPlaybackController,
  createYtmPlaybackDriver,
  type PlaybackController,
} from "@/core/playback-controller";
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
  private hotkeyPlaybackController: PlaybackController | null = null;

  init(): void {}
  destroy(): void {
    this.hotkeyPlaybackController?.destroy();
    this.hotkeyPlaybackController = null;
  }

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
    const playbackController = createPlaybackController(
      createYtmPlaybackDriver(context.ytm),
    );
    playbackController.subscribe((snapshot) => {
      if (snapshot.ok) {
        context.events.emit("playback-state-changed", snapshot.data);
      }
    });
    this.hotkeyPlaybackController = playbackController;

    for (const [command, action] of Object.entries(COMMAND_ACTION_MAP)) {
      registry.register(command, async () => {
        try {
          await playbackController.executeAction(action);
        } catch (err) {
          error("Hotkey action failed:", err);
        }
      });
    }

    registry.register("focus-ytm-tab", async () => {
      await context.ytm.focusTab().catch(() => undefined);
    });
  }
}

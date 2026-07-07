import { error } from "@/core/logger";
import type { HotkeyHandlerRegistry } from "@/core/hotkey-registry";
import type { ModuleHandlerRegistry } from "@/core/messaging";
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
  private tabFaviconIndicatorEnabled = true;
  private hotkeyPlaybackController: PlaybackController | null = null;
  private tabChangeContext: ModuleContext | null = null;
  private readonly tabChangeListener = (): void => {
    if (!this.tabChangeContext) return;
    void this.syncTabFaviconIndicator(this.tabChangeContext);
  };

  init(context?: ModuleContext): void {
    if (!context) return;
    this.tabChangeContext = context;
    context.events.on("ytm-tabs-changed", this.tabChangeListener);
  }

  destroy(): void {
    this.hotkeyPlaybackController?.destroy();
    this.hotkeyPlaybackController = null;
    this.tabChangeContext?.events.off(
      "ytm-tabs-changed",
      this.tabChangeListener,
    );
    this.tabChangeContext = null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getTabFaviconIndicatorEnabled(): boolean {
    return this.tabFaviconIndicatorEnabled;
  }

  setTabFaviconIndicatorEnabled(enabled: boolean): void {
    this.tabFaviconIndicatorEnabled = enabled;
  }

  getPopupViews(context: ModuleContext): PopupView[] {
    return [createPlaybackControlsPopupView(context)];
  }

  async syncContentState(context: ModuleContext): Promise<void> {
    await this.syncTabFaviconIndicator(context);
  }

  registerHandlers(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void {
    registry.on("get-tab-favicon-indicator-enabled", async () => ({
      ok: true,
      data: this.getTabFaviconIndicatorEnabled(),
    }));

    registry.on("set-tab-favicon-indicator-enabled", async (message) => {
      const enabled = message.enabled === true;
      this.setTabFaviconIndicatorEnabled(enabled);
      void context.state.saveValue(
        "playback-controls.tabFaviconIndicatorEnabled",
        enabled,
      );
      await this.syncTabFaviconIndicator(context);
      return { ok: true };
    });
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

  private async syncTabFaviconIndicator(context: ModuleContext): Promise<void> {
    await context.ytm.syncSelectedTabFaviconIndicator(
      this.getTabFaviconIndicatorEnabled(),
    );
  }
}

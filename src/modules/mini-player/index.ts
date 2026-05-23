import type { FeatureModule, ModuleContext, PopupView } from "@/core/types";
import type { ModuleHandlerRegistry } from "@/core/messaging";
import { createMiniPlayerPopupView } from "./popup";

export class MiniPlayerModule implements FeatureModule {
  readonly id = "mini-player";
  readonly name = "Mini Player";
  readonly description =
    "Picture-in-Picture mini player with playback controls";

  private enabled = true;
  private suppressNotificationsWhilePipOpen = false;

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

  isSuppressNotificationsWhilePipOpenEnabled(): boolean {
    return this.suppressNotificationsWhilePipOpen;
  }

  setSuppressNotificationsWhilePipOpen(enabled: boolean): void {
    this.suppressNotificationsWhilePipOpen = enabled;
  }

  getPopupViews(context?: ModuleContext): PopupView[] {
    return [createMiniPlayerPopupView(context)];
  }

  registerHandlers(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void {
    registry.on("get-mini-player-enabled", async () => ({
      ok: true,
      data: this.isEnabled(),
    }));
    registry.on("set-mini-player-enabled", async (message) => {
      this.setEnabled(message.enabled as boolean);
      void context.state.saveValue("mini-player.enabled", message.enabled);
      return { ok: true };
    });
    registry.on("get-mini-player-suppress-notifications", async () => ({
      ok: true,
      data: this.isSuppressNotificationsWhilePipOpenEnabled(),
    }));
    registry.on("set-mini-player-suppress-notifications", async (message) => {
      this.setSuppressNotificationsWhilePipOpen(message.enabled as boolean);
      void context.state.saveValue(
        "mini-player.suppressNotificationsWhilePipOpen",
        message.enabled,
      );
      return { ok: true };
    });
  }
}

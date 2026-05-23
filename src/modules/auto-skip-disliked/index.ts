import type { FeatureModule, ModuleContext, PopupView } from "@/core/types";
import type { ModuleHandlerRegistry } from "@/core/messaging";
import { createAutoSkipDislikedPopupView } from "./popup";

export class AutoSkipDislikedModule implements FeatureModule {
  readonly id = "auto-skip-disliked";
  readonly name = "Auto-Skip Disliked";
  readonly description = "Automatically skip disliked songs during playback";

  private enabled = false;

  init(): void {
    // No background-side setup needed; skip logic runs in the
    // content script via the track observer callback.
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

  getPopupViews(context?: ModuleContext): PopupView[] {
    return [createAutoSkipDislikedPopupView(context)];
  }

  registerHandlers(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void {
    registry.on("get-auto-skip-disliked-enabled", async () => ({
      ok: true,
      data: this.isEnabled(),
    }));
    registry.on("set-auto-skip-disliked-enabled", async (message) => {
      this.setEnabled(message.enabled as boolean);
      void context.state.saveValue(
        "auto-skip-disliked.enabled",
        message.enabled,
      );
      void context.ytm.broadcast({
        type: "set-auto-skip-disliked-enabled",
        enabled: message.enabled,
      });
      return { ok: true };
    });
  }
}

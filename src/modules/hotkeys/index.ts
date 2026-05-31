import type { FeatureModule, ModuleContext, PopupView } from "@/core/types";
import type { HotkeyHandlerRegistry } from "@/core/hotkey-registry";
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

  getPopupViews(context: ModuleContext): PopupView[] {
    return [createHotkeysPopupView(context)];
  }

  registerHotkeys(
    registry: HotkeyHandlerRegistry,
    context: ModuleContext,
  ): void {
    registry.register("focus-ytm-tab", async () => {
      await context.ytm.focusTab().catch(() => undefined);
    });
  }
}

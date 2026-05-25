import type {
  AutoPlayMode,
  FeatureModule,
  ModuleContext,
  PopupView,
} from "@/core/types";
import type { ModuleHandlerRegistry } from "@/core/messaging";
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

  getPopupViews(context: ModuleContext): PopupView[] {
    return [createAutoPlayPopupView(context)];
  }

  registerHandlers(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void {
    registry.on("get-auto-play-enabled", async () => ({
      ok: true,
      data: this.isEnabled(),
    }));
    registry.on("get-auto-play-mode", async () => ({
      ok: true,
      data: this.getMode(),
    }));
    registry.on("set-auto-play-enabled", async (message) => {
      const mode: AutoPlayMode = message.enabled === true ? "on" : "off";
      await this.setModeAndPersist(mode, context, message.enabled);
      return { ok: true };
    });
    registry.on("set-auto-play-mode", async (message) => {
      await this.setModeAndPersist(
        normalizeAutoPlayMode(message.mode),
        context,
      );
      return { ok: true };
    });
  }

  private async setModeAndPersist(
    mode: AutoPlayMode,
    context: ModuleContext,
    legacyEnabled?: unknown,
  ): Promise<void> {
    this.setMode(mode);
    if (mode !== "on") {
      context.events.emit("auto-play-policy-reset", undefined);
    }
    await context.state.saveValue("auto-play.mode", mode);
    if (legacyEnabled !== undefined) {
      await context.state.saveValue("auto-play.enabled", legacyEnabled);
    }
    void context.ytm.broadcast({ type: "set-auto-play-mode", mode });
  }
}

function normalizeAutoPlayMode(mode: unknown): AutoPlayMode {
  return mode === "default" || mode === "off" || mode === "on"
    ? mode
    : "default";
}

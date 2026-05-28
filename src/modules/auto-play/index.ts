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
  private policyBlockedTabIds = new Set<number>();
  private lifecycleEventsRegistered = false;

  init(): void {
    // No background-side setup needed; auto-play logic runs in
    // the content script.
  }

  destroy(): void {
    this.mode = "default";
    this.policyBlockedTabIds.clear();
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
    this.registerLifecycleEvents(context);

    registry.on("get-auto-play-enabled", async () => ({
      ok: true,
      data: this.isEnabled(),
    }));
    registry.on("get-auto-play-mode", async () => ({
      ok: true,
      data: this.getMode(),
    }));
    registry.on("get-auto-play-status", async () => {
      const tabState = await context.ytm.listTabs();
      const browserAutoplayBlocked =
        tabState.selectedTabId !== null &&
        this.policyBlockedTabIds.has(tabState.selectedTabId);
      return { ok: true, data: { browserAutoplayBlocked } };
    });
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
    registry.on("set-auto-play-policy-blocked", async (message, sender) => {
      const tabId = sender?.tab?.id;
      if (tabId === undefined) return { ok: false, error: "No tab ID" };

      const wasBlocked = this.policyBlockedTabIds.has(tabId);
      if (message.blocked === true) {
        this.policyBlockedTabIds.add(tabId);
      } else {
        this.policyBlockedTabIds.delete(tabId);
      }

      if (this.policyBlockedTabIds.has(tabId) !== wasBlocked) {
        this.notifyStatusChanged(context);
      }

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
      this.clearPolicyBlockedTabs(context);
    }
    await context.state.saveValue("auto-play.mode", mode);
    if (legacyEnabled !== undefined) {
      await context.state.saveValue("auto-play.enabled", legacyEnabled);
    }
    void context.ytm.broadcast({ type: "set-auto-play-mode", mode });
  }

  private registerLifecycleEvents(context: ModuleContext): void {
    if (this.lifecycleEventsRegistered) return;
    this.lifecycleEventsRegistered = true;
    context.events.on<{ tabId: number }>("ytm-tab-reset", ({ tabId }) => {
      if (this.policyBlockedTabIds.delete(tabId)) {
        this.notifyStatusChanged(context);
      }
    });
  }

  private clearPolicyBlockedTabs(context: ModuleContext): void {
    if (this.policyBlockedTabIds.size === 0) return;
    this.policyBlockedTabIds.clear();
    this.notifyStatusChanged(context);
  }

  private notifyStatusChanged(context: ModuleContext): void {
    context.popupEvents.broadcast({ type: "auto-play-status-changed" });
  }
}

function normalizeAutoPlayMode(mode: unknown): AutoPlayMode {
  return mode === "default" || mode === "off" || mode === "on"
    ? mode
    : "default";
}

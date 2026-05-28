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
  private pipOpenTabIds = new Set<number>();
  private tabResetContext: ModuleContext | null = null;
  private tabResetListener: ((event: { tabId: number }) => void) | null = null;

  init(): void {
    // No background-side setup needed; the mini player is controlled
    // from the content script.
  }

  destroy(): void {
    this.pipOpenTabIds.clear();
    if (this.tabResetContext && this.tabResetListener) {
      this.tabResetContext.events.off("ytm-tab-reset", this.tabResetListener);
    }
    this.tabResetContext = null;
    this.tabResetListener = null;
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

  hasOpenPipWindow(): boolean {
    return this.pipOpenTabIds.size > 0;
  }

  getPopupViews(context: ModuleContext): PopupView[] {
    return [createMiniPlayerPopupView(context)];
  }

  registerHandlers(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void {
    this.registerLifecycleEvents(context);

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
    registry.on("pip-open-state", async (message, sender) => {
      const tabId = sender?.tab?.id;
      if (tabId === undefined) return { ok: false, error: "No tab ID" };
      if (message.open === true) {
        this.pipOpenTabIds.add(tabId);
      } else {
        this.pipOpenTabIds.delete(tabId);
      }
      return { ok: true };
    });
  }

  private registerLifecycleEvents(context: ModuleContext): void {
    if (this.tabResetListener) return;
    this.tabResetListener = ({ tabId }) => {
      this.pipOpenTabIds.delete(tabId);
    };
    this.tabResetContext = context;
    context.events.on("ytm-tab-reset", this.tabResetListener);
  }
}

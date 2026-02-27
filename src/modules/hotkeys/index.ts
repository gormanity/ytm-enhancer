import type { FeatureModule, PlaybackAction, PopupView } from "@/core/types";
import type { MessageSender } from "@/core/actions";
import { ActionExecutor } from "@/core/actions";
import { findYTMTab } from "@/core/tab-finder";
import { createHotkeysPopupView } from "./popup";

const COMMAND_MAP: Record<string, PlaybackAction> = {
  "play-pause": "togglePlay",
  "next-track": "next",
  "previous-track": "previous",
};

export class HotkeysModule implements FeatureModule {
  readonly id = "hotkeys";
  readonly name = "Hotkeys";
  readonly description = "Configurable keyboard shortcuts for YouTube Music";

  private enabled = true;
  private executor: ActionExecutor;

  constructor(send: MessageSender) {
    this.executor = new ActionExecutor(send);
  }

  async init(): Promise<void> {
    // Command listener is registered at the top level of the background
    // script to satisfy Chrome MV3 service worker requirements.
  }

  destroy(): void {
    // Listener lifecycle is managed by the background script.
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getPopupViews(): PopupView[] {
    return [createHotkeysPopupView()];
  }

  async handleCommand(command: string): Promise<void> {
    const action = COMMAND_MAP[command];
    if (!action) return;

    const tab = await findYTMTab();
    if (!tab?.id) return;

    try {
      await this.executor.execute(action, tab.id);
    } catch (err) {
      console.error("[YTM Enhancer] Hotkey action failed:", err);
    }
  }
}

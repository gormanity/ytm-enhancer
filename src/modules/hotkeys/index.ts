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
  private commandListener: ((command: string) => void) | null = null;

  constructor(send: MessageSender) {
    this.executor = new ActionExecutor(send);
  }

  async init(): Promise<void> {
    this.commandListener = (command: string) => {
      void this.handleCommand(command);
    };
    chrome.commands.onCommand.addListener(this.commandListener);
  }

  destroy(): void {
    if (this.commandListener) {
      chrome.commands.onCommand.removeListener(this.commandListener);
      this.commandListener = null;
    }
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

  private async handleCommand(command: string): Promise<void> {
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

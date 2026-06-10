import type { AutoPlayMode, ModuleContext, PopupView } from "@/core/types";
import { bindModuleSelect, bindModuleToggle } from "@/popup/module-ui";
import { renderPopupTemplate } from "@/popup/template";
import {
  createAutoPlayClient,
  type AutoPlayClient,
} from "@/modules/auto-play/client";
import {
  createAutoSkipDislikedClient,
  type AutoSkipDislikedClient,
} from "@/modules/auto-skip-disliked/client";
import templateHtml from "./popup.html?raw";

export interface AutomationPopupClients {
  autoPlay: AutoPlayClient;
  autoSkipDisliked: AutoSkipDislikedClient;
}

const AUTO_PLAY_MODE_HINTS: Record<AutoPlayMode, string> = {
  default: "Use YouTube Music's normal startup playback behavior.",
  off: "Prevent playback from starting automatically when YouTube Music loads.",
  on: "Start playback automatically when YouTube Music loads with music ready to play.",
};

function createAutomationPopupClients(
  context: ModuleContext,
): AutomationPopupClients {
  return {
    autoPlay: createAutoPlayClient(context.runtime),
    autoSkipDisliked: createAutoSkipDislikedClient(context.runtime),
  };
}

/** Create the combined playback automation popup view. */
export function createAutomationPopupView(
  context: ModuleContext,
  clients: AutomationPopupClients = createAutomationPopupClients(context),
): PopupView {
  return {
    id: "automation-settings",
    label: "Automation",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const modeSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="automation-auto-play-mode"]',
      );
      const blockedHint = container.querySelector<HTMLElement>(
        '[data-role="automation-auto-play-browser-blocked"]',
      );
      const modeHint = container.querySelector<HTMLElement>(
        '[data-role="automation-auto-play-mode-hint"]',
      );
      const modeRow = container.querySelector<HTMLElement>(
        '[data-role="automation-auto-play-mode-row"]',
      );

      const updateModeHint = (mode: AutoPlayMode) => {
        if (!modeHint) return;
        modeHint.textContent = AUTO_PLAY_MODE_HINTS[mode];
      };

      const setBlockedHintVisible = (visible: boolean) => {
        blockedHint?.classList.toggle("is-hidden", !visible);
        modeRow?.classList.toggle("has-following-message", visible);
      };

      const updateBlockedHint = () => {
        void clients.autoPlay
          .getStatus()
          .then((data) => {
            setBlockedHintVisible(data.browserAutoplayBlocked === true);
          })
          .catch(() => undefined);
      };

      bindModuleSelect(container, "automation-auto-play-mode", {
        get: async () => {
          const mode = await clients.autoPlay.getMode();
          updateModeHint(mode);
          return mode;
        },
        set: (mode) => {
          const autoPlayMode = mode as AutoPlayMode;
          updateModeHint(autoPlayMode);
          return clients.autoPlay.setMode(autoPlayMode);
        },
      });
      bindModuleToggle(container, "automation-auto-skip-disliked-toggle", {
        get: () => clients.autoSkipDisliked.isEnabled(),
        set: (enabled) => clients.autoSkipDisliked.setEnabled(enabled),
      });

      const modeChangeListener = () => {
        if (modeSelect?.value !== "on") {
          setBlockedHintVisible(false);
          return;
        }
        updateBlockedHint();
      };

      modeSelect?.addEventListener("change", modeChangeListener);
      updateBlockedHint();

      const unsubscribe =
        clients.autoPlay.subscribeStatusChanged(updateBlockedHint);

      return () => {
        modeSelect?.removeEventListener("change", modeChangeListener);
        unsubscribe();
      };
    },
  };
}

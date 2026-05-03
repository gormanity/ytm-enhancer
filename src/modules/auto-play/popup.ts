import type { AutoPlayMode, PopupView } from "@/core/types";
import { bindSelect } from "@/popup/bind-select";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

function normalizeMode(mode: unknown): AutoPlayMode {
  return mode === "default" || mode === "off" || mode === "on"
    ? mode
    : "default";
}

type AutoPlayStatusResponse = {
  ok: boolean;
  data?: {
    browserAutoplayBlocked?: boolean;
  };
};

/** Create the auto-play settings popup view. */
export function createAutoPlayPopupView(): PopupView {
  return {
    id: "auto-play-settings",
    label: "Auto-Play",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const modeSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="auto-play-mode"]',
      );
      const blockedHint = container.querySelector<HTMLElement>(
        '[data-role="auto-play-browser-blocked"]',
      );
      const modeRow = container.querySelector<HTMLElement>(
        '[data-role="auto-play-mode-row"]',
      );

      const setBlockedHintVisible = (visible: boolean) => {
        blockedHint?.classList.toggle("is-hidden", !visible);
        modeRow?.classList.toggle("has-following-message", visible);
      };

      const updateBlockedHint = () => {
        chrome.runtime.sendMessage(
          { type: "get-auto-play-status" },
          (response: AutoPlayStatusResponse) => {
            if (chrome.runtime.lastError || !blockedHint) return;
            const shouldShow =
              response?.ok === true &&
              response.data?.browserAutoplayBlocked === true;
            setBlockedHintVisible(shouldShow);
          },
        );
      };

      bindSelect(container, "auto-play-mode", {
        getType: "get-auto-play-mode",
        setType: "set-auto-play-mode",
        setKey: "mode",
        parseData: normalizeMode,
        transformValue: normalizeMode,
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

      const runtimeMessageListener = (message: { type: string }) => {
        if (message.type === "auto-play-status-changed") {
          updateBlockedHint();
        }
      };
      chrome.runtime.onMessage.addListener(runtimeMessageListener);

      return () => {
        modeSelect?.removeEventListener("change", modeChangeListener);
        chrome.runtime.onMessage.removeListener(runtimeMessageListener);
      };
    },
  };
}

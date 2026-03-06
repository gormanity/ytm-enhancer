import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

/** Create the auto-play settings popup view. */
export function createAutoPlayPopupView(): PopupView {
  return {
    id: "auto-play-settings",
    label: "Auto-Play",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const toggle = container.querySelector<HTMLInputElement>(
        '[data-role="auto-play-toggle"]',
      );
      if (!toggle) return;
      toggle.disabled = true;

      // Query current state from the background script.
      chrome.runtime.sendMessage(
        { type: "get-auto-play-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (response?.ok) {
            toggle.checked = response.data === true;
            toggle.disabled = false;
          }
        },
      );

      toggle.addEventListener("change", () => {
        toggle.disabled = true;
        chrome.runtime.sendMessage(
          {
            type: "set-auto-play-enabled",
            enabled: toggle.checked,
          },
          () => {
            toggle.disabled = false;
          },
        );
      });
    },
  };
}

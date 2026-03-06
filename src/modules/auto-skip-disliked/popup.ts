import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

/** Create the auto-skip disliked songs settings popup view. */
export function createAutoSkipDislikedPopupView(): PopupView {
  return {
    id: "auto-skip-disliked-settings",
    label: "Auto-Skip Disliked",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const toggle = container.querySelector<HTMLInputElement>(
        '[data-role="auto-skip-disliked-toggle"]',
      );
      if (!toggle) return;
      toggle.disabled = true;

      // Query current state from the background script.
      chrome.runtime.sendMessage(
        { type: "get-auto-skip-disliked-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (response?.ok) {
            toggle.checked = response.data === true;
            toggle.disabled = false;
          }
        },
      );

      toggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-auto-skip-disliked-enabled",
          enabled: toggle.checked,
        });
      });
    },
  };
}

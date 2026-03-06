import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

export function createStreamQualityPopupView(): PopupView {
  return {
    id: "stream-quality-settings",
    label: "Stream Quality",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const select = container.querySelector<HTMLSelectElement>(
        '[data-role="stream-quality-select"]',
      );
      const hint = container.querySelector<HTMLParagraphElement>(
        '[data-role="stream-quality-hint"]',
      );
      if (!select || !hint) return;
      select.disabled = true;
      const placeholder =
        select.querySelector<HTMLOptionElement>('option[value=""]');

      chrome.runtime.sendMessage(
        { type: "get-stream-quality" },
        (
          response: { ok: boolean; data?: { current: string | null } } | null,
        ) => {
          if (response?.ok) {
            if (response.data?.current) {
              select.value = response.data.current;
            } else {
              // If we got OK but no current, maybe default to Normal (2)
              select.value = "2";
            }
            select.disabled = false;
            hint.classList.add("is-hidden");
            // Remove placeholder once we have a value
            placeholder?.remove();
          }
        },
      );

      select.addEventListener("change", () => {
        if (select.value) {
          chrome.runtime.sendMessage({
            type: "set-stream-quality",
            value: select.value,
          });
        }
      });
    },
  };
}

import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

export function createPrecisionVolumePopupView(): PopupView {
  return {
    id: "precision-volume-settings",
    label: "Precision Volume",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const range = container.querySelector<HTMLInputElement>(
        '[data-role="precision-volume-range"]',
      );
      const numberInput = container.querySelector<HTMLInputElement>(
        '[data-role="precision-volume-number"]',
      );
      if (!range || !numberInput) return;
      range.disabled = true;
      numberInput.disabled = true;

      chrome.runtime.sendMessage(
        { type: "get-volume" },
        (response: { ok: boolean; data?: number } | null) => {
          if (!response?.ok) return;

          const percent = Math.round((response.data ?? 1) * 100);
          range.value = String(percent);
          numberInput.value = String(percent);
          range.disabled = false;
          numberInput.disabled = false;
        },
      );

      range.addEventListener("input", () => {
        const percent = Number(range.value);
        numberInput.value = String(percent);
        chrome.runtime.sendMessage({
          type: "set-volume",
          volume: percent / 100,
        });
      });

      numberInput.addEventListener("change", () => {
        let percent = Number(numberInput.value);
        percent = Math.max(0, Math.min(100, percent));
        numberInput.value = String(percent);
        range.value = String(percent);
        chrome.runtime.sendMessage({
          type: "set-volume",
          volume: percent / 100,
        });
      });
    },
  };
}

import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";
import selectControlTemplateHtml from "./select-control.html?raw";

function initializePlaybackSpeedControl(container: HTMLElement): void {
  const select = container.querySelector<HTMLSelectElement>(
    '[data-role="playback-speed-select"]',
  );
  if (!select) return;
  select.disabled = true;
  const placeholder =
    select.querySelector<HTMLOptionElement>('option[value=""]');

  chrome.runtime.sendMessage(
    { type: "get-playback-speed" },
    (response: { ok: boolean; data?: number } | null) => {
      if (response?.ok) {
        select.value = String(response.data ?? 1);
        select.disabled = false;
        // Remove placeholder once we have a value
        placeholder?.remove();
      }
    },
  );

  select.addEventListener("change", () => {
    if (select.value) {
      chrome.runtime.sendMessage({
        type: "set-playback-speed",
        rate: Number(select.value),
      });
    }
  });
}

export function renderPlaybackSpeedSelectControl(container: HTMLElement): void {
  renderPopupTemplate(container, selectControlTemplateHtml);
  initializePlaybackSpeedControl(container);
}

export function createPlaybackSpeedPopupView(): PopupView {
  return {
    id: "playback-speed-settings",
    label: "Playback Speed",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      initializePlaybackSpeedControl(container);
    },
  };
}

import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindSelect } from "@/popup/bind-select";
import templateHtml from "./popup.html?raw";
import selectControlTemplateHtml from "./select-control.html?raw";

function initializePlaybackSpeedControl(container: HTMLElement): void {
  bindSelect(container, "playback-speed-select", {
    getType: "get-playback-speed",
    setType: "set-playback-speed",
    parseData: (data) => String(data ?? 1),
    setKey: "rate",
    transformValue: (v) => Number(v),
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
      const slot = container.querySelector<HTMLElement>(
        '[data-role="playback-speed-control-slot"]',
      );
      if (!slot) return;
      renderPlaybackSpeedSelectControl(slot);
    },
  };
}

import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindSelect } from "@/popup/bind-select";
import templateHtml from "./popup.html?raw";
import selectControlTemplateHtml from "./select-control.html?raw";

function initializeStreamQualityControl(container: HTMLElement): void {
  const hint = container.querySelector<HTMLElement>(
    '[data-role="stream-quality-hint"]',
  );

  bindSelect(container, "stream-quality-select", {
    getType: "get-stream-quality",
    setType: "set-stream-quality",
    parseData: (data) => {
      const d = data as { current: string | null } | undefined;
      return d?.current ?? "2";
    },
    onLoaded: () => {
      hint?.classList.add("is-hidden");
    },
  });
}

export function renderStreamQualitySelectControl(container: HTMLElement): void {
  renderPopupTemplate(container, selectControlTemplateHtml);
  initializeStreamQualityControl(container);
}

export function createStreamQualityPopupView(): PopupView {
  return {
    id: "stream-quality-settings",
    label: "Stream Quality",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const slot = container.querySelector<HTMLElement>(
        '[data-role="stream-quality-control-slot"]',
      );
      if (!slot) return;
      renderStreamQualitySelectControl(slot);
    },
  };
}

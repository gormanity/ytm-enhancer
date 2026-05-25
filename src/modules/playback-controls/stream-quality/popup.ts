import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleSelect } from "@/popup/module-ui";
import templateHtml from "./popup.html?raw";
import selectControlTemplateHtml from "./select-control.html?raw";

function initializeStreamQualityControl(
  container: HTMLElement,
  context: ModuleContext,
): void {
  const hint = container.querySelector<HTMLElement>(
    '[data-role="stream-quality-hint"]',
  );

  bindModuleSelect(container, "stream-quality-select", {
    get: async () => {
      const data = await context.ytm.getStreamQuality();
      return (
        (data as { current?: string | null } | null)?.current ?? data ?? "2"
      );
    },
    set: (value) => context.ytm.setStreamQuality(value),
  });
  hint?.classList.add("is-hidden");
}

export function renderStreamQualitySelectControl(
  container: HTMLElement,
  context: ModuleContext,
): void {
  renderPopupTemplate(container, selectControlTemplateHtml);
  initializeStreamQualityControl(container, context);
}

export function createStreamQualityPopupView(
  context: ModuleContext,
): PopupView {
  return {
    id: "stream-quality-settings",
    label: "Stream Quality",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const slot = container.querySelector<HTMLElement>(
        '[data-role="stream-quality-control-slot"]',
      );
      if (!slot) return;
      renderStreamQualitySelectControl(slot, context);
    },
  };
}

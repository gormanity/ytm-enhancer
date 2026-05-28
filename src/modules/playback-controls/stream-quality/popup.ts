import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleSelect } from "@/popup/module-ui";
import templateHtml from "./popup.html?raw";
import selectControlTemplateHtml from "./select-control.html?raw";

function parseCurrentQuality(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return null;

  const current = (data as { current?: unknown }).current;
  return typeof current === "string" ? current : null;
}

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
      const current = parseCurrentQuality(data);
      hint?.classList.toggle("is-hidden", current !== null);
      return current ?? "2";
    },
    set: (value) => context.ytm.setStreamQuality(value),
  });
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

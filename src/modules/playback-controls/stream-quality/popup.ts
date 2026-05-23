import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleSelect } from "@/popup/module-ui";
import templateHtml from "./popup.html?raw";
import selectControlTemplateHtml from "./select-control.html?raw";

function initializeStreamQualityControl(
  container: HTMLElement,
  context?: ModuleContext,
): void {
  const hint = container.querySelector<HTMLElement>(
    '[data-role="stream-quality-hint"]',
  );

  bindModuleSelect(
    container,
    "stream-quality-select",
    context
      ? {
          get: async () => {
            const data = await context.ytm.getStreamQuality();
            return ((data as { current?: string | null } | null)?.current ??
              data ??
              "2") as string;
          },
          set: (value) => context.ytm.setStreamQuality(value),
        }
      : {
          getType: "get-stream-quality",
          setType: "set-stream-quality",
          parseData: (data) => {
            const d = data as { current: string | null } | undefined;
            return d?.current ?? "2";
          },
          onLoaded: () => {
            hint?.classList.add("is-hidden");
          },
        },
  );
  if (context) hint?.classList.add("is-hidden");
}

export function renderStreamQualitySelectControl(
  container: HTMLElement,
  context?: ModuleContext,
): void {
  renderPopupTemplate(container, selectControlTemplateHtml);
  initializeStreamQualityControl(container, context);
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

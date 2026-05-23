import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleSelect } from "@/popup/module-ui";
import templateHtml from "./popup.html?raw";
import selectControlTemplateHtml from "./select-control.html?raw";

function initializePlaybackSpeedControl(
  container: HTMLElement,
  context?: ModuleContext,
): void {
  bindModuleSelect(
    container,
    "playback-speed-select",
    context
      ? {
          get: async () => String(await context.ytm.getPlaybackSpeed()),
          set: (value) => context.ytm.setPlaybackSpeed(Number(value)),
        }
      : {
          getType: "get-playback-speed",
          setType: "set-playback-speed",
          parseData: (data) => String(data ?? 1),
          setKey: "rate",
          transformValue: (v) => Number(v),
        },
  );
}

export function renderPlaybackSpeedSelectControl(
  container: HTMLElement,
  context?: ModuleContext,
): void {
  renderPopupTemplate(container, selectControlTemplateHtml);
  initializePlaybackSpeedControl(container, context);
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

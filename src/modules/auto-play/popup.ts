import type { AutoPlayMode, PopupView } from "@/core/types";
import { bindSelect } from "@/popup/bind-select";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

function normalizeMode(mode: unknown): AutoPlayMode {
  return mode === "default" || mode === "off" || mode === "on"
    ? mode
    : "default";
}

/** Create the auto-play settings popup view. */
export function createAutoPlayPopupView(): PopupView {
  return {
    id: "auto-play-settings",
    label: "Auto-Play",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      bindSelect(container, "auto-play-mode", {
        getType: "get-auto-play-mode",
        setType: "set-auto-play-mode",
        setKey: "mode",
        parseData: normalizeMode,
        transformValue: normalizeMode,
      });
    },
  };
}

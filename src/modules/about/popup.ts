import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

/** Create the About popup view. */
export function createAboutPopupView(): PopupView {
  return {
    id: "about",
    label: "About",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
    },
  };
}

import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindToggle } from "@/popup/bind-toggle";
import templateHtml from "./popup.html?raw";

/** Create the auto-skip disliked songs settings popup view. */
export function createAutoSkipDislikedPopupView(): PopupView {
  return {
    id: "auto-skip-disliked-settings",
    label: "Auto-Skip Disliked",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      bindToggle(container, "auto-skip-disliked-toggle", {
        getType: "get-auto-skip-disliked-enabled",
        setType: "set-auto-skip-disliked-enabled",
      });
    },
  };
}

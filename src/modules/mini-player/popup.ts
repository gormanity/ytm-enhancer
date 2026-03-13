import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindToggle } from "@/popup/bind-toggle";
import templateHtml from "./popup.html?raw";

/** Create the mini player settings popup view. */
export function createMiniPlayerPopupView(): PopupView {
  return {
    id: "mini-player-settings",
    label: "Mini Player",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      bindToggle(container, "mini-player-enabled-toggle", {
        getType: "get-mini-player-enabled",
        setType: "set-mini-player-enabled",
      });
      bindToggle(container, "mini-player-suppress-notifications-toggle", {
        getType: "get-mini-player-suppress-notifications",
        setType: "set-mini-player-suppress-notifications",
      });
    },
  };
}

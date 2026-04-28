import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindToggle } from "@/popup/bind-toggle";
import templateHtml from "./popup.html?raw";

function hasDocumentPipSupport(): boolean {
  return typeof documentPictureInPicture !== "undefined";
}

/** Create the mini player settings popup view. */
export function createMiniPlayerPopupView(): PopupView {
  return {
    id: "mini-player-settings",
    label: "Mini Player",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const hasDocumentPip = hasDocumentPipSupport();
      if (!hasDocumentPip) {
        container
          .querySelector<HTMLElement>(
            '[data-role="mini-player-document-pip-tip"]',
          )
          ?.classList.remove("is-hidden");

        for (const input of container.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]',
        )) {
          input.checked = false;
          input.disabled = true;
        }
        return;
      }

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

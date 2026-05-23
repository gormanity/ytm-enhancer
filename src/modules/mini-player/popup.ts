import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleToggle } from "@/popup/module-ui";
import templateHtml from "./popup.html?raw";

function hasDocumentPipSupport(): boolean {
  return typeof documentPictureInPicture !== "undefined";
}

/** Create the mini player settings popup view. */
export function createMiniPlayerPopupView(context?: ModuleContext): PopupView {
  return {
    id: "mini-player-settings",
    label: "Mini Player",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const hasDocumentPip =
        context?.capabilities.documentPip ?? hasDocumentPipSupport();
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

      bindModuleToggle(
        container,
        "mini-player-enabled-toggle",
        context
          ? {
              get: () =>
                context.runtime.request<boolean>({
                  type: "get-mini-player-enabled",
                }),
              set: (enabled) =>
                context.runtime.command({
                  type: "set-mini-player-enabled",
                  enabled,
                }),
            }
          : {
              getType: "get-mini-player-enabled",
              setType: "set-mini-player-enabled",
            },
      );
      bindModuleToggle(
        container,
        "mini-player-suppress-notifications-toggle",
        context
          ? {
              get: () =>
                context.runtime.request<boolean>({
                  type: "get-mini-player-suppress-notifications",
                }),
              set: (enabled) =>
                context.runtime.command({
                  type: "set-mini-player-suppress-notifications",
                  enabled,
                }),
            }
          : {
              getType: "get-mini-player-suppress-notifications",
              setType: "set-mini-player-suppress-notifications",
            },
      );
    },
  };
}

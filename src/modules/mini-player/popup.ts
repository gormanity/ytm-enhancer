import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleToggle } from "@/popup/module-ui";
import templateHtml from "./popup.html?raw";

/** Create the mini player settings popup view. */
export function createMiniPlayerPopupView(context: ModuleContext): PopupView {
  return {
    id: "mini-player-settings",
    label: "Mini Player",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const resizeTip = container.querySelector<HTMLElement>(
        '[data-role="mini-player-resize-tip"]',
      );
      const setMiniPlayerGuidanceVisible = (enabled: boolean) => {
        resizeTip?.classList.toggle("is-hidden", !enabled);
      };

      if (!context.capabilities.documentPip) {
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

      bindModuleToggle(container, "mini-player-enabled-toggle", {
        get: async () => {
          const enabled = await context.runtime.request<boolean>({
            type: "get-mini-player-enabled",
          });
          setMiniPlayerGuidanceVisible(enabled);
          return enabled;
        },
        set: (enabled) => {
          setMiniPlayerGuidanceVisible(enabled);
          return context.runtime.command({
            type: "set-mini-player-enabled",
            enabled,
          });
        },
      });
      bindModuleToggle(container, "mini-player-suppress-notifications-toggle", {
        get: () =>
          context.runtime.request<boolean>({
            type: "get-mini-player-suppress-notifications",
          }),
        set: (enabled) =>
          context.runtime.command({
            type: "set-mini-player-suppress-notifications",
            enabled,
          }),
      });
    },
  };
}

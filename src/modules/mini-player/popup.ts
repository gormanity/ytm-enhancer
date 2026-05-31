import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleToggle } from "@/popup/module-ui";
import { createMiniPlayerClient, type MiniPlayerClient } from "./client";
import templateHtml from "./popup.html?raw";

/** Create the mini player settings popup view. */
export function createMiniPlayerPopupView(
  context: ModuleContext,
  client: MiniPlayerClient = createMiniPlayerClient(context.runtime),
): PopupView {
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
          const enabled = await client.isEnabled();
          setMiniPlayerGuidanceVisible(enabled);
          return enabled;
        },
        set: (enabled) => {
          setMiniPlayerGuidanceVisible(enabled);
          return client.setEnabled(enabled);
        },
      });
      bindModuleToggle(container, "mini-player-suppress-notifications-toggle", {
        get: () => client.getSuppressNotifications(),
        set: (enabled) => client.setSuppressNotifications(enabled),
      });
    },
  };
}

import type { AutoPlayMode, ModuleContext, PopupView } from "@/core/types";
import { bindModuleSelect } from "@/popup/module-ui";
import { renderPopupTemplate } from "@/popup/template";
import { createAutoPlayClient, type AutoPlayClient } from "./client";
import templateHtml from "./popup.html?raw";

/** Create the auto-play settings popup view. */
export function createAutoPlayPopupView(
  context: ModuleContext,
  client: AutoPlayClient = createAutoPlayClient(context.runtime),
): PopupView {
  return {
    id: "auto-play-settings",
    label: "Auto-Play",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const modeSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="auto-play-mode"]',
      );
      const blockedHint = container.querySelector<HTMLElement>(
        '[data-role="auto-play-browser-blocked"]',
      );
      const modeRow = container.querySelector<HTMLElement>(
        '[data-role="auto-play-mode-row"]',
      );

      const setBlockedHintVisible = (visible: boolean) => {
        blockedHint?.classList.toggle("is-hidden", !visible);
        modeRow?.classList.toggle("has-following-message", visible);
      };

      const updateBlockedHint = () => {
        void client
          .getStatus()
          .then((data) => {
            setBlockedHintVisible(data.browserAutoplayBlocked === true);
          })
          .catch(() => undefined);
      };

      bindModuleSelect(container, "auto-play-mode", {
        get: () => client.getMode(),
        set: (mode) => client.setMode(mode as AutoPlayMode),
      });

      const modeChangeListener = () => {
        if (modeSelect?.value !== "on") {
          setBlockedHintVisible(false);
          return;
        }
        updateBlockedHint();
      };

      modeSelect?.addEventListener("change", modeChangeListener);
      updateBlockedHint();

      const unsubscribe = client.subscribeStatusChanged(updateBlockedHint);

      return () => {
        modeSelect?.removeEventListener("change", modeChangeListener);
        unsubscribe();
      };
    },
  };
}

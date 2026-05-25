import type { AutoPlayMode, ModuleContext, PopupView } from "@/core/types";
import { bindModuleSelect } from "@/popup/module-ui";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

function normalizeMode(mode: unknown): AutoPlayMode {
  return mode === "default" || mode === "off" || mode === "on"
    ? mode
    : "default";
}

/** Create the auto-play settings popup view. */
export function createAutoPlayPopupView(context: ModuleContext): PopupView {
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
        void context.runtime
          .request<{ browserAutoplayBlocked?: boolean }>({
            type: "get-auto-play-status",
          })
          .then((data) => {
            setBlockedHintVisible(data.browserAutoplayBlocked === true);
          })
          .catch(() => undefined);
      };

      bindModuleSelect(container, "auto-play-mode", {
        get: async () =>
          normalizeMode(
            await context.runtime.request<AutoPlayMode>({
              type: "get-auto-play-mode",
            }),
          ),
        set: (mode) =>
          context.runtime.command({
            type: "set-auto-play-mode",
            mode: normalizeMode(mode),
          }),
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

      const runtimeMessageListener = (message: { type: string }) => {
        if (message.type === "auto-play-status-changed") {
          updateBlockedHint();
        }
      };
      const unsubscribe = context.runtime.subscribe(runtimeMessageListener);

      return () => {
        modeSelect?.removeEventListener("change", modeChangeListener);
        unsubscribe();
      };
    },
  };
}

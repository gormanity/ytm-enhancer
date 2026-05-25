import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleToggle } from "@/popup/module-ui";
import templateHtml from "./popup.html?raw";

/** Create the auto-skip disliked songs settings popup view. */
export function createAutoSkipDislikedPopupView(
  context: ModuleContext,
): PopupView {
  return {
    id: "auto-skip-disliked-settings",
    label: "Auto-Skip Disliked",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      bindModuleToggle(container, "auto-skip-disliked-toggle", {
        get: () =>
          context.runtime.request<boolean>({
            type: "get-auto-skip-disliked-enabled",
          }),
        set: (enabled) =>
          context.runtime.command({
            type: "set-auto-skip-disliked-enabled",
            enabled,
          }),
      });
    },
  };
}

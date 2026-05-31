import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleToggle } from "@/popup/module-ui";
import {
  createAutoSkipDislikedClient,
  type AutoSkipDislikedClient,
} from "./client";
import templateHtml from "./popup.html?raw";

/** Create the auto-skip disliked songs settings popup view. */
export function createAutoSkipDislikedPopupView(
  context: ModuleContext,
  client: AutoSkipDislikedClient = createAutoSkipDislikedClient(
    context.runtime,
  ),
): PopupView {
  return {
    id: "auto-skip-disliked-settings",
    label: "Auto-Skip Disliked",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      bindModuleToggle(container, "auto-skip-disliked-toggle", {
        get: () => client.isEnabled(),
        set: (enabled) => client.setEnabled(enabled),
      });
    },
  };
}

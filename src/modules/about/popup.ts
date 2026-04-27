import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

/** Create the About popup view. */
export function createAboutPopupView(): PopupView {
  return {
    id: "about",
    label: "About",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const versionEl = container.querySelector<HTMLElement>(
        '[data-role="about-version"]',
      );
      if (versionEl) {
        const manifest = chrome.runtime.getManifest();
        versionEl.textContent = `v${manifest.version}`;
      }
    },
  };
}

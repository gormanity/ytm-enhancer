import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

/** Create the mini player settings popup view. */
export function createMiniPlayerPopupView(): PopupView {
  return {
    id: "mini-player-settings",
    label: "Mini Player",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const pipToggle = container.querySelector<HTMLInputElement>(
        '[data-role="mini-player-enabled-toggle"]',
      );
      const suppressNotificationsToggle =
        container.querySelector<HTMLInputElement>(
          '[data-role="mini-player-suppress-notifications-toggle"]',
        );
      if (!pipToggle || !suppressNotificationsToggle) return;

      pipToggle.disabled = true;
      suppressNotificationsToggle.disabled = true;

      chrome.runtime.sendMessage(
        { type: "get-mini-player-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (!response?.ok) return;
          pipToggle.checked = response.data === true;
          pipToggle.disabled = false;
        },
      );

      chrome.runtime.sendMessage(
        { type: "get-mini-player-suppress-notifications" },
        (response: { ok: boolean; data?: boolean }) => {
          if (!response?.ok) return;
          suppressNotificationsToggle.checked = response.data === true;
          suppressNotificationsToggle.disabled = false;
        },
      );

      pipToggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-mini-player-enabled",
          enabled: pipToggle.checked,
        });
      });

      suppressNotificationsToggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-mini-player-suppress-notifications",
          enabled: suppressNotificationsToggle.checked,
        });
      });
    },
  };
}

import type { NotificationFields } from "./index";
import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindToggle } from "@/popup/bind-toggle";
import templateHtml from "./popup.html?raw";

const FIELD_KEYS: Array<keyof NotificationFields> = [
  "title",
  "artist",
  "album",
  "year",
  "artwork",
];

/** Create the notifications settings popup view. */
export function createNotificationsPopupView(): PopupView {
  return {
    id: "notifications-settings",
    label: "Notifications",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      bindToggle(container, "notifications-toggle", {
        getType: "get-notifications-enabled",
        setType: "set-notifications-enabled",
      });
      bindToggle(container, "notifications-unpause-toggle", {
        getType: "get-notify-on-unpause",
        setType: "set-notify-on-unpause",
      });

      const previewBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="notifications-preview-btn"]',
      );
      if (!previewBtn) return;

      // Display fields section
      const fieldCheckboxes: {
        key: keyof NotificationFields;
        input: HTMLInputElement;
      }[] = [];

      for (const key of FIELD_KEYS) {
        const input = container.querySelector<HTMLInputElement>(
          `[data-role="notifications-field-${key}"]`,
        );
        if (!input) continue;
        input.disabled = true;
        fieldCheckboxes.push({ key, input });
      }

      chrome.runtime.sendMessage(
        { type: "get-notification-fields" },
        (response: { ok: boolean; data?: NotificationFields }) => {
          if (response?.ok && response.data) {
            for (const { key, input } of fieldCheckboxes) {
              input.checked = response.data[key];
              input.disabled = false;
            }
          }
        },
      );

      for (const { input } of fieldCheckboxes) {
        input.addEventListener("change", () => {
          const fields = {} as NotificationFields;
          for (const { key, input: cb } of fieldCheckboxes) {
            fields[key] = cb.checked;
          }
          chrome.runtime.sendMessage({
            type: "set-notification-fields",
            fields,
          });
        });
      }

      // Preview section
      previewBtn.onclick = () => {
        chrome.runtime.sendMessage({ type: "preview-notification" });
      };
    },
  };
}

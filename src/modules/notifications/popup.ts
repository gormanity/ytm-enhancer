import type { NotificationFields } from "./index";
import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

const FIELD_LABELS: { key: keyof NotificationFields; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "year", label: "Year" },
  { key: "artwork", label: "Artwork" },
];

/** Create the notifications settings popup view. */
export function createNotificationsPopupView(): PopupView {
  return {
    id: "notifications-settings",
    label: "Notifications",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const toggle = container.querySelector<HTMLInputElement>(
        '[data-role="notifications-toggle"]',
      );
      const unpauseToggle = container.querySelector<HTMLInputElement>(
        '[data-role="notifications-unpause-toggle"]',
      );
      const fieldsRoot = container.querySelector<HTMLElement>(
        '[data-role="notifications-fields"]',
      );
      const previewBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="notifications-preview-btn"]',
      );
      if (!toggle || !unpauseToggle || !fieldsRoot || !previewBtn) return;

      toggle.disabled = true;

      // Query current state from the background script.
      chrome.runtime.sendMessage(
        { type: "get-notifications-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (response?.ok) {
            toggle.checked = response.data === true;
            toggle.disabled = false;
          }
        },
      );

      toggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-notifications-enabled",
          enabled: toggle.checked,
        });
      });
      unpauseToggle.disabled = true;

      chrome.runtime.sendMessage(
        { type: "get-notify-on-unpause" },
        (response: { ok: boolean; data?: boolean }) => {
          if (response?.ok) {
            unpauseToggle.checked = response.data === true;
            unpauseToggle.disabled = false;
          }
        },
      );

      unpauseToggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-notify-on-unpause",
          enabled: unpauseToggle.checked,
        });
      });

      // Display fields section
      const fieldCheckboxes: {
        key: keyof NotificationFields;
        input: HTMLInputElement;
      }[] = [];

      for (const { key, label: fieldLabel } of FIELD_LABELS) {
        const row = document.createElement("label");
        row.className = "field-row";

        const span = document.createElement("span");
        span.textContent = fieldLabel;
        row.appendChild(span);

        const input = document.createElement("input");
        input.type = "checkbox";
        input.disabled = true;
        row.appendChild(input);

        fieldCheckboxes.push({ key, input });
        fieldsRoot.appendChild(row);
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

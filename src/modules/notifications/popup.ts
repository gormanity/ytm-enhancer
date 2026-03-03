import type { NotificationFields } from "./index";
import type { PopupView } from "@/core/types";

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
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Track Notifications";
      container.appendChild(heading);

      const label = document.createElement("label");
      label.className = "toggle-row";

      const text = document.createElement("span");
      text.textContent = "Show notifications on track change";
      label.appendChild(text);

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.disabled = true;
      label.appendChild(toggle);

      container.appendChild(label);

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

      const unpauseLabel = document.createElement("label");
      unpauseLabel.className = "toggle-row";

      const unpauseText = document.createElement("span");
      unpauseText.textContent = "Show notification when resuming playback";
      unpauseLabel.appendChild(unpauseText);

      const unpauseToggle = document.createElement("input");
      unpauseToggle.type = "checkbox";
      unpauseToggle.disabled = true;
      unpauseLabel.appendChild(unpauseToggle);

      container.appendChild(unpauseLabel);

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
      const fieldsHeading = document.createElement("h3");
      fieldsHeading.textContent = "Display fields";
      container.appendChild(fieldsHeading);

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
        container.appendChild(row);
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
    },
  };
}

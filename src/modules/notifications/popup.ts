import type { PopupView } from "@/core/types";

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
    },
  };
}

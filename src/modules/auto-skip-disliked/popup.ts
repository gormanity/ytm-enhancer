import type { PopupView } from "@/core/types";

/** Create the auto-skip disliked songs settings popup view. */
export function createAutoSkipDislikedPopupView(): PopupView {
  return {
    id: "auto-skip-disliked-settings",
    label: "Auto-Skip Disliked",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Auto-Skip Disliked Songs";
      container.appendChild(heading);

      const card = document.createElement("div");
      card.className = "settings-card";
      container.appendChild(card);

      const label = document.createElement("label");
      label.className = "toggle-row";

      const text = document.createElement("span");
      text.textContent = "Automatically skip disliked songs";
      label.appendChild(text);

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.disabled = true;
      label.appendChild(toggle);

      card.appendChild(label);

      // Query current state from the background script.
      chrome.runtime.sendMessage(
        { type: "get-auto-skip-disliked-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (response?.ok) {
            toggle.checked = response.data === true;
            toggle.disabled = false;
          }
        },
      );

      toggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-auto-skip-disliked-enabled",
          enabled: toggle.checked,
        });
      });
    },
  };
}

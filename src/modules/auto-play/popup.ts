import type { PopupView } from "@/core/types";

/** Create the auto-play settings popup view. */
export function createAutoPlayPopupView(): PopupView {
  return {
    id: "auto-play-settings",
    label: "Auto-Play",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Auto-Play";
      container.appendChild(heading);

      const card = document.createElement("div");
      card.className = "settings-card";
      container.appendChild(card);

      const label = document.createElement("label");
      label.className = "toggle-row";

      const text = document.createElement("span");
      text.textContent = "Auto-play on page load";
      label.appendChild(text);

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.disabled = true;
      label.appendChild(toggle);

      card.appendChild(label);

      // Query current state from the background script.
      chrome.runtime.sendMessage(
        { type: "get-auto-play-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (response?.ok) {
            toggle.checked = response.data === true;
            toggle.disabled = false;
          }
        },
      );

      toggle.addEventListener("change", () => {
        toggle.disabled = true;
        chrome.runtime.sendMessage(
          {
            type: "set-auto-play-enabled",
            enabled: toggle.checked,
          },
          () => {
            toggle.disabled = false;
          },
        );
      });
    },
  };
}

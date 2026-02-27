import type { PopupView } from "@/core/types";

/** Create the mini player settings popup view. */
export function createMiniPlayerPopupView(): PopupView {
  return {
    id: "mini-player-settings",
    label: "Mini Player",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Mini Player";
      container.appendChild(heading);

      const label = document.createElement("label");
      label.className = "toggle-row";

      const text = document.createElement("span");
      text.textContent = "Enable mini player PiP button";
      label.appendChild(text);

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.disabled = true;
      label.appendChild(toggle);

      container.appendChild(label);

      chrome.runtime.sendMessage(
        { type: "get-mini-player-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (response?.ok) {
            toggle.checked = response.data === true;
            toggle.disabled = false;
          }
        },
      );

      toggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-mini-player-enabled",
          enabled: toggle.checked,
        });
      });
    },
  };
}

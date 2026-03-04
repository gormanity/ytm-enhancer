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

      const card = document.createElement("div");
      card.className = "settings-card";
      container.appendChild(card);

      const pipToggle = createToggleRow(card, "Enable mini player PiP button");
      const suppressNotificationsToggle = createToggleRow(
        card,
        "Suppress notifications while PiP is open",
      );

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

function createToggleRow(
  parent: HTMLElement,
  textContent: string,
): HTMLInputElement {
  const label = document.createElement("label");
  label.className = "toggle-row";

  const text = document.createElement("span");
  text.textContent = textContent;
  label.appendChild(text);

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.disabled = true;
  label.appendChild(toggle);

  parent.appendChild(label);
  return toggle;
}

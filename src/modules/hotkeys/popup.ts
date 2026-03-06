import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

/** Create the hotkeys settings popup view. */
export function createHotkeysPopupView(): PopupView {
  return {
    id: "hotkeys-settings",
    label: "Hotkeys",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const list = container.querySelector<HTMLElement>(
        '[data-role="shortcuts-list"]',
      );
      const rowTemplate = container.querySelector<HTMLTemplateElement>(
        '[data-role="shortcut-row-template"]',
      );
      if (!list || !rowTemplate) return;
      loadShortcuts(list, rowTemplate);

      const configBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="configure-shortcuts"]',
      );
      if (!configBtn) return;
      configBtn.onclick = () => {
        const url =
          __BROWSER__ === "firefox"
            ? "about:addons"
            : "chrome://extensions/shortcuts";
        chrome.tabs.create({ url });
      };
    },
  };
}

const KEY_SYMBOL_MAP: Record<string, string> = {
  Left: "←",
  Right: "→",
  Up: "↑",
  Down: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  MediaNextTrack: "⏭",
  MediaPrevTrack: "⏮",
  MediaPlayPause: "⏯",
};

function loadShortcuts(
  container: HTMLElement,
  rowTemplate: HTMLTemplateElement,
): void {
  chrome.commands.getAll((commands) => {
    for (const cmd of commands) {
      if (!cmd.name || cmd.name === "_execute_action") continue;

      const rowFragment = rowTemplate.content.cloneNode(true);
      const row =
        rowFragment.firstElementChild instanceof HTMLDivElement
          ? rowFragment.firstElementChild
          : null;
      if (!row) continue;

      const label = row.querySelector<HTMLElement>(".shortcut-label");
      const keysContainer = row.querySelector<HTMLElement>(".shortcut-keys");
      if (!label || !keysContainer) continue;
      label.textContent = cmd.description ?? cmd.name;

      if (cmd.shortcut) {
        const parts = cmd.shortcut.split("+");
        for (let i = 0; i < parts.length; i++) {
          const key = parts[i].trim();
          const symbol = KEY_SYMBOL_MAP[key] || key;

          const kbd = document.createElement("kbd");
          kbd.className = "shortcut-key";
          if (KEY_SYMBOL_MAP[key]) {
            kbd.classList.add("key-symbol");
          }
          kbd.textContent = symbol;
          keysContainer.appendChild(kbd);

          if (i < parts.length - 1) {
            const separator = document.createElement("span");
            separator.className = "shortcut-separator";
            separator.textContent = "+";
            keysContainer.appendChild(separator);
          }
        }
      } else {
        const kbd = document.createElement("kbd");
        kbd.className = "shortcut-key";
        kbd.textContent = "Not set";
        keysContainer.appendChild(kbd);
      }

      row.appendChild(label);
      row.appendChild(keysContainer);
      container.appendChild(row);
    }
  });
}

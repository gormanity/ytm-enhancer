import type { PopupView } from "@/core/types";

/** Create the hotkeys settings popup view. */
export function createHotkeysPopupView(): PopupView {
  return {
    id: "hotkeys-settings",
    label: "Hotkeys",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Keyboard Shortcuts";
      container.appendChild(heading);

      const card = document.createElement("div");
      card.className = "settings-card";
      container.appendChild(card);

      const list = document.createElement("div");
      list.className = "shortcuts-list";
      card.appendChild(list);

      loadShortcuts(list);

      const actions = document.createElement("div");
      actions.className = "panel-actions";
      card.appendChild(actions);

      const configBtn = document.createElement("button");
      configBtn.textContent = "Configure Shortcuts";
      configBtn.className = "primary-btn primary-btn--block";
      configBtn.onclick = () => {
        const url =
          __BROWSER__ === "firefox"
            ? "about:addons"
            : "chrome://extensions/shortcuts";
        chrome.tabs.create({ url });
      };
      actions.appendChild(configBtn);

      const hint = document.createElement("div");
      hint.className = "shortcuts-hint";
      const hintPrefix = document.createElement("strong");
      hintPrefix.textContent = "Tip:";
      hint.appendChild(hintPrefix);
      hint.appendChild(document.createTextNode(" Set shortcuts to "));
      const globalText = document.createElement("strong");
      globalText.textContent = "Global";
      hint.appendChild(globalText);
      hint.appendChild(
        document.createTextNode(
          " in browser settings to control playback while using other apps.",
        ),
      );
      container.appendChild(hint);
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

function loadShortcuts(container: HTMLElement): void {
  chrome.commands.getAll((commands) => {
    for (const cmd of commands) {
      if (!cmd.name || cmd.name === "_execute_action") continue;

      const row = document.createElement("div");
      row.className = "shortcut-row";

      const label = document.createElement("span");
      label.className = "shortcut-label";
      label.textContent = cmd.description ?? cmd.name;

      const keysContainer = document.createElement("div");
      keysContainer.className = "shortcut-keys";

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

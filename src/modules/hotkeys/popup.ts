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

      const list = document.createElement("div");
      list.className = "shortcuts-list";
      container.appendChild(list);

      loadShortcuts(list);

      const hint = document.createElement("p");
      hint.className = "shortcuts-hint";
      hint.textContent =
        "To change shortcuts, visit your browser's extension shortcuts page.";
      container.appendChild(hint);
    },
  };
}

function loadShortcuts(container: HTMLElement): void {
  chrome.commands.getAll((commands) => {
    for (const cmd of commands) {
      if (!cmd.name || cmd.name === "_execute_action") continue;

      const row = document.createElement("div");
      row.className = "shortcut-row";

      const label = document.createElement("span");
      label.className = "shortcut-label";
      label.textContent = cmd.description ?? cmd.name;

      const key = document.createElement("kbd");
      key.className = "shortcut-key";
      key.textContent = cmd.shortcut || "Not set";

      row.appendChild(label);
      row.appendChild(key);
      container.appendChild(row);
    }
  });
}

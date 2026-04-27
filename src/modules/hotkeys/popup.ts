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
      const keyTemplate = container.querySelector<HTMLTemplateElement>(
        '[data-role="shortcut-key-template"]',
      );
      const separatorTemplate = container.querySelector<HTMLTemplateElement>(
        '[data-role="shortcut-separator-template"]',
      );
      if (!list || !rowTemplate || !keyTemplate || !separatorTemplate) return;
      loadShortcuts(list, rowTemplate, keyTemplate, separatorTemplate);

      const configActions = container.querySelector<HTMLElement>(
        '[data-role="configure-shortcuts-actions"]',
      );
      const firefoxInstructions = container.querySelector<HTMLElement>(
        '[data-role="firefox-shortcuts-instructions"]',
      );
      const configBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="configure-shortcuts"]',
      );

      // Firefox blocks programmatic navigation to privileged about: URLs from
      // tabs.create, so we show inline instructions instead of a button.
      if (__BROWSER__ === "firefox") {
        configActions?.classList.add("is-hidden");
        firefoxInstructions?.classList.remove("is-hidden");
      } else if (configBtn) {
        configBtn.onclick = () => {
          chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
        };
      }
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
  keyTemplate: HTMLTemplateElement,
  separatorTemplate: HTMLTemplateElement,
): void {
  const createKeyElement = (
    value: string,
    isSymbol: boolean,
  ): HTMLElement | null => {
    const keyFragment = keyTemplate.content.cloneNode(true) as DocumentFragment;
    const key =
      keyFragment.firstElementChild instanceof HTMLElement
        ? keyFragment.firstElementChild
        : null;
    if (!key) return null;
    key.textContent = value;
    if (isSymbol) {
      key.classList.add("key-symbol");
    }
    return key;
  };

  const createSeparatorElement = (): HTMLElement | null => {
    const separatorFragment = separatorTemplate.content.cloneNode(
      true,
    ) as DocumentFragment;
    const separator =
      separatorFragment.firstElementChild instanceof HTMLElement
        ? separatorFragment.firstElementChild
        : null;
    return separator;
  };

  chrome.commands.getAll((commands) => {
    for (const cmd of commands) {
      if (!cmd.name || cmd.name === "_execute_action") continue;

      const rowFragment = rowTemplate.content.cloneNode(
        true,
      ) as DocumentFragment;
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

          const kbd = createKeyElement(symbol, Boolean(KEY_SYMBOL_MAP[key]));
          if (!kbd) continue;
          keysContainer.appendChild(kbd);

          if (i < parts.length - 1) {
            const separator = createSeparatorElement();
            if (!separator) continue;
            keysContainer.appendChild(separator);
          }
        }
      } else {
        const kbd = createKeyElement("Not set", false);
        if (!kbd) continue;
        keysContainer.appendChild(kbd);
      }

      container.appendChild(row);
    }
  });
}

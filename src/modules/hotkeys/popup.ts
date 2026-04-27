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

// On macOS, Chrome already returns modifier symbols (⌃ ⇧ ⌥ ⌘) from
// chrome.commands.getAll, while Firefox returns text names ("MacCtrl",
// "Command", "Alt", "Shift"). Map text → symbol so both browsers display the
// same way on Mac.
const MAC_MODIFIER_SYMBOLS: Record<string, string> = {
  MacCtrl: "⌃",
  Ctrl: "⌃",
  Shift: "⇧",
  Alt: "⌥",
  Command: "⌘",
};

const MAC_SYMBOL_RE = /[⌃⇧⌥⌘]/;

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(
    navigator.platform || navigator.userAgent || "",
  );
}

interface KeyToken {
  value: string;
  isSymbol: boolean;
}

function tokenizeShortcut(shortcut: string, mac: boolean): KeyToken[] {
  const segments = shortcut
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  const tokens: KeyToken[] = [];

  for (const seg of segments) {
    // Mac symbol(s) embedded in the segment (e.g. Chrome Mac may concatenate
    // modifiers like "⌥⇧P" without separators). Peel symbols from the front,
    // then resolve any trailing key.
    if (mac && MAC_SYMBOL_RE.test(seg)) {
      let i = 0;
      while (i < seg.length && MAC_SYMBOL_RE.test(seg[i])) {
        tokens.push({ value: seg[i], isSymbol: true });
        i++;
      }
      const rest = seg.slice(i);
      if (rest) tokens.push(resolveKey(rest));
      continue;
    }

    if (mac && MAC_MODIFIER_SYMBOLS[seg]) {
      tokens.push({ value: MAC_MODIFIER_SYMBOLS[seg], isSymbol: true });
      continue;
    }

    tokens.push(resolveKey(seg));
  }

  return tokens;
}

function resolveKey(key: string): KeyToken {
  const symbol = KEY_SYMBOL_MAP[key];
  if (symbol) return { value: symbol, isSymbol: true };
  return { value: key, isSymbol: false };
}

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
        const tokens = tokenizeShortcut(cmd.shortcut, isMacPlatform());
        for (let i = 0; i < tokens.length; i++) {
          const { value, isSymbol } = tokens[i];
          const kbd = createKeyElement(value, isSymbol);
          if (!kbd) continue;
          keysContainer.appendChild(kbd);

          if (i < tokens.length - 1) {
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

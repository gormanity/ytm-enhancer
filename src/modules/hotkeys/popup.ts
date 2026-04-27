import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import {
  findConflict,
  keyEventToShortcut,
  keyEventToShortcutParts,
  validateShortcut,
} from "./shortcut-capture";
import templateHtml from "./popup.html?raw";

interface EditState {
  name: string;
  row: HTMLElement;
  keydownHandler: (e: KeyboardEvent) => void;
  keyupHandler: (e: KeyboardEvent) => void;
}

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

      const renderKeys = makeKeyRenderer(keyTemplate, separatorTemplate);

      const configActions = container.querySelector<HTMLElement>(
        '[data-role="configure-shortcuts-actions"]',
      );
      const configBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="configure-shortcuts"]',
      );

      // Firefox exposes browser.commands.update / reset; Chromium doesn't. Use
      // the capability check to drive UI, not a brand check.
      const canEdit = typeof chrome.commands.update === "function";

      const state: { active: EditState | null } = { active: null };

      const refresh = () => {
        loadShortcuts(list, rowTemplate, renderKeys, {
          canEdit,
          onEdit: (row, name) =>
            enterEdit(state, row, name, renderKeys, refresh),
          onReset: (name) => resetShortcut(name, refresh),
        });
      };

      refresh();

      if (canEdit) {
        configActions?.classList.add("is-hidden");
        // Firefox has no "Global" shortcut option, so the tip doesn't apply.
        container
          .querySelector<HTMLElement>('[data-role="shortcuts-global-tip"]')
          ?.classList.add("is-hidden");
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

type KeyRenderer = (target: HTMLElement, shortcut: string) => void;

function makeKeyRenderer(
  keyTemplate: HTMLTemplateElement,
  separatorTemplate: HTMLTemplateElement,
): KeyRenderer {
  const createKey = (token: KeyToken): HTMLElement | null => {
    const fragment = keyTemplate.content.cloneNode(true) as DocumentFragment;
    const el =
      fragment.firstElementChild instanceof HTMLElement
        ? fragment.firstElementChild
        : null;
    if (!el) return null;
    el.textContent = token.value;
    if (token.isSymbol) el.classList.add("key-symbol");
    return el;
  };
  const createSeparator = (): HTMLElement | null => {
    const fragment = separatorTemplate.content.cloneNode(
      true,
    ) as DocumentFragment;
    return fragment.firstElementChild instanceof HTMLElement
      ? fragment.firstElementChild
      : null;
  };

  return (target, shortcut) => {
    target.replaceChildren();
    const tokens = tokenizeShortcut(shortcut, isMacPlatform());
    for (let i = 0; i < tokens.length; i++) {
      const kbd = createKey(tokens[i]);
      if (kbd) target.appendChild(kbd);
      if (i < tokens.length - 1) {
        const sep = createSeparator();
        if (sep) target.appendChild(sep);
      }
    }
  };
}

interface LoadOptions {
  canEdit: boolean;
  onEdit: (row: HTMLElement, name: string) => void;
  onReset: (name: string) => void;
}

function loadShortcuts(
  container: HTMLElement,
  rowTemplate: HTMLTemplateElement,
  renderKeys: KeyRenderer,
  options: LoadOptions,
): void {
  chrome.commands.getAll((commands) => {
    container.replaceChildren();
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
        renderKeys(keysContainer, cmd.shortcut);
      } else {
        const empty = document.createElement("kbd");
        empty.className = "shortcut-key";
        empty.textContent = "Not set";
        keysContainer.appendChild(empty);
      }

      if (options.canEdit) {
        const actions = row.querySelector<HTMLElement>(
          '[data-role="shortcut-actions"]',
        );
        const editBtn = row.querySelector<HTMLButtonElement>(
          '[data-role="shortcut-edit-btn"]',
        );
        const resetBtn = row.querySelector<HTMLButtonElement>(
          '[data-role="shortcut-reset-btn"]',
        );
        const cancelBtn = row.querySelector<HTMLButtonElement>(
          '[data-role="shortcut-cancel-btn"]',
        );
        actions?.classList.remove("is-hidden");
        const name = cmd.name;
        editBtn?.addEventListener("click", () => options.onEdit(row, name));
        resetBtn?.addEventListener("click", () => options.onReset(name));
        cancelBtn?.addEventListener("click", () => exitEdit(row));
      }

      container.appendChild(row);
    }
  });
}

function setMode(row: HTMLElement, mode: "display" | "edit"): void {
  const right = row.querySelector<HTMLElement>(".shortcut-row-right");
  if (right) right.dataset.mode = mode;
}

function renderEditPreview(
  row: HTMLElement,
  parts: { modifiers: string[]; main: string | null },
  renderKeys: KeyRenderer,
): void {
  const target = row.querySelector<HTMLElement>(
    '[data-role="shortcut-edit-keys"]',
  );
  if (!target) return;
  if (parts.modifiers.length === 0 && !parts.main) {
    const prompt = document.createElement("span");
    prompt.className = "shortcut-edit-prompt";
    prompt.textContent = "Press a shortcut…";
    target.replaceChildren(prompt);
    return;
  }
  const segments = [...parts.modifiers];
  if (parts.main) segments.push(parts.main);
  renderKeys(target, segments.join("+"));
}

function enterEdit(
  state: { active: EditState | null },
  row: HTMLElement,
  name: string,
  renderKeys: KeyRenderer,
  refresh: () => void,
): void {
  if (state.active) {
    cleanupEdit(state.active);
    state.active = null;
  }

  const error = row.querySelector<HTMLElement>('[data-role="shortcut-error"]');
  setMode(row, "edit");
  error?.classList.add("is-hidden");
  renderEditPreview(row, { modifiers: [], main: null }, renderKeys);

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cleanupEdit(state.active!);
      state.active = null;
      exitEdit(row);
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const parts = keyEventToShortcutParts(e);
    renderEditPreview(row, parts, renderKeys);

    const shortcut = keyEventToShortcut(e);
    if (!shortcut) return;

    const validation = validateShortcut(shortcut);
    if (!validation.ok) {
      showError(row, validation.reason);
      return;
    }

    chrome.commands.getAll((commands) => {
      const conflict = findConflict(shortcut, commands, name);
      if (conflict) {
        const conflictLabel = conflict.description || conflict.name || "";
        showError(row, `Already used by "${conflictLabel}"`);
        return;
      }
      const result = chrome.commands.update?.({ name, shortcut });
      Promise.resolve(result).then(() => {
        cleanupEdit(state.active!);
        state.active = null;
        refresh();
      });
    });
  };

  const handleKeyup = (e: KeyboardEvent) => {
    // Update the live preview when a modifier is released so it always matches
    // what's currently held. Don't trigger save.
    const parts = keyEventToShortcutParts(e);
    renderEditPreview(
      row,
      { modifiers: parts.modifiers, main: null },
      renderKeys,
    );
  };

  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("keyup", handleKeyup, true);
  state.active = {
    name,
    row,
    keydownHandler: handleKeydown,
    keyupHandler: handleKeyup,
  };
}

function cleanupEdit(edit: EditState): void {
  document.removeEventListener("keydown", edit.keydownHandler, true);
  document.removeEventListener("keyup", edit.keyupHandler, true);
}

function exitEdit(row: HTMLElement): void {
  const error = row.querySelector<HTMLElement>('[data-role="shortcut-error"]');
  setMode(row, "display");
  error?.classList.add("is-hidden");
}

function showError(row: HTMLElement, message: string): void {
  const error = row.querySelector<HTMLElement>('[data-role="shortcut-error"]');
  if (!error) return;
  error.textContent = message;
  error.classList.remove("is-hidden");
}

function resetShortcut(name: string, refresh: () => void): void {
  const result = chrome.commands.reset?.(name);
  Promise.resolve(result).then(() => refresh());
}

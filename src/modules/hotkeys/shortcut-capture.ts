/**
 * Helpers for the Firefox-only inline shortcut editor.
 *
 * The WebExtensions `commands` shortcut format:
 * - One main key, optionally preceded by modifiers separated by `+`.
 * - Allowed modifiers: `Ctrl`, `Alt`, `Shift`, `Command`, `MacCtrl`.
 * - Allowed main keys: A-Z, 0-9, F1-F12, named keys (Comma, Period, Home,
 *   End, PageUp, PageDown, Space, Insert, Delete, Up, Down, Left, Right),
 *   and media keys (MediaNextTrack, MediaPlayPause, MediaPrevTrack, MediaStop).
 * - Function keys can stand alone; media keys must stand alone; everything
 *   else needs at least one of Ctrl/Alt/Command/MacCtrl (Shift alone is not
 *   sufficient).
 */

const PRIMARY_MODIFIERS = new Set(["Ctrl", "Command", "MacCtrl"]);
const ALLOWED_MODIFIERS = new Set([
  "Ctrl",
  "Alt",
  "Shift",
  "Command",
  "MacCtrl",
]);
const NAMED_KEYS = new Set([
  "Comma",
  "Period",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Space",
  "Insert",
  "Delete",
  "Up",
  "Down",
  "Left",
  "Right",
]);
const MEDIA_KEYS = new Set([
  "MediaNextTrack",
  "MediaPlayPause",
  "MediaPrevTrack",
  "MediaStop",
]);
const FUNCTION_KEY_RE = /^F([1-9]|1[0-2])$/;

const CODE_TO_KEY: Record<string, string> = {
  Comma: "Comma",
  Period: "Period",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Space: "Space",
  Insert: "Insert",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  MediaTrackNext: "MediaNextTrack",
  MediaTrackPrevious: "MediaPrevTrack",
  MediaPlayPause: "MediaPlayPause",
  MediaStop: "MediaStop",
};

const MODIFIER_ONLY_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

export interface CaptureOptions {
  isMac?: boolean;
}

/**
 * Convert a `KeyboardEvent` into a WebExtensions shortcut string. Returns
 * `null` if the event represents only modifier presses, or if the main key is
 * not bindable.
 */
export function keyEventToShortcut(
  event: KeyboardEvent,
  options: CaptureOptions = {},
): string | null {
  const isMac = options.isMac ?? isMacPlatform();
  const main = mapMainKey(event);
  if (!main) return null;

  const modifiers: string[] = [];
  if (isMac) {
    if (event.metaKey) modifiers.push("Command");
    if (event.ctrlKey) modifiers.push("MacCtrl");
  } else if (event.ctrlKey) {
    modifiers.push("Ctrl");
  }
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  return [...modifiers, main].join("+");
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateShortcut(shortcut: string): ValidationResult {
  if (!shortcut) return { ok: false, reason: "Shortcut is empty" };

  const parts = shortcut.split("+");
  const main = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  for (const m of modifiers) {
    if (!ALLOWED_MODIFIERS.has(m)) {
      return { ok: false, reason: `"${m}" is not a valid modifier` };
    }
  }

  const primaryCount = modifiers.filter((m) => PRIMARY_MODIFIERS.has(m)).length;
  if (primaryCount > 1) {
    return { ok: false, reason: "Only one of Ctrl/Command/MacCtrl is allowed" };
  }

  const isFunction = FUNCTION_KEY_RE.test(main);
  const isMedia = MEDIA_KEYS.has(main);
  const isLetter = /^[A-Z]$/.test(main);
  const isDigit = /^[0-9]$/.test(main);
  const isNamed = NAMED_KEYS.has(main);

  if (!isFunction && !isMedia && !isLetter && !isDigit && !isNamed) {
    return { ok: false, reason: `"${main}" is not a bindable key` };
  }

  if (isMedia) {
    if (modifiers.length > 0) {
      return { ok: false, reason: "Media keys cannot have modifiers" };
    }
    return { ok: true };
  }

  if (isFunction) return { ok: true };

  const hasRequired = modifiers.some(
    (m) => m === "Ctrl" || m === "Alt" || m === "Command" || m === "MacCtrl",
  );
  if (!hasRequired) {
    return {
      ok: false,
      reason: "Shortcut needs Ctrl, Alt, Command, or Control",
    };
  }

  return { ok: true };
}

/**
 * Find another command (from `chrome.commands.getAll()`) that already binds
 * the same shortcut. `excludeName` is the command being edited.
 */
export function findConflict(
  shortcut: string,
  commands: chrome.commands.Command[],
  excludeName: string,
): chrome.commands.Command | null {
  for (const cmd of commands) {
    if (cmd.name === excludeName) continue;
    if (cmd.shortcut === shortcut) return cmd;
  }
  return null;
}

function mapMainKey(event: KeyboardEvent): string | null {
  if (MODIFIER_ONLY_CODES.has(event.code)) return null;

  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(event.code)) return event.code;

  return CODE_TO_KEY[event.code] ?? null;
}

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(
    navigator.platform || navigator.userAgent || "",
  );
}

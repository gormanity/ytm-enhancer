import { describe, it, expect } from "vitest";
import {
  keyEventToShortcut,
  validateShortcut,
  findConflict,
} from "@/modules/hotkeys/shortcut-capture";

function makeEvent(init: Partial<KeyboardEventInit> & { code: string }) {
  return new KeyboardEvent("keydown", { ...init });
}

describe("keyEventToShortcut", () => {
  it("returns null when only modifier keys are pressed", () => {
    expect(
      keyEventToShortcut(makeEvent({ code: "ControlLeft", ctrlKey: true }), {
        isMac: false,
      }),
    ).toBeNull();
    expect(
      keyEventToShortcut(makeEvent({ code: "ShiftLeft", shiftKey: true }), {
        isMac: false,
      }),
    ).toBeNull();
  });

  it("returns null for unbindable keys", () => {
    expect(
      keyEventToShortcut(makeEvent({ code: "Tab" }), { isMac: false }),
    ).toBeNull();
    expect(
      keyEventToShortcut(makeEvent({ code: "Escape" }), { isMac: false }),
    ).toBeNull();
  });

  it("captures letter keys with modifiers on non-Mac", () => {
    const shortcut = keyEventToShortcut(
      makeEvent({ code: "KeyP", ctrlKey: true, shiftKey: true }),
      { isMac: false },
    );
    expect(shortcut).toBe("Ctrl+Shift+P");
  });

  it("captures digit keys with Alt", () => {
    const shortcut = keyEventToShortcut(
      makeEvent({ code: "Digit3", altKey: true }),
      { isMac: false },
    );
    expect(shortcut).toBe("Alt+3");
  });

  it("captures function keys without modifiers", () => {
    const shortcut = keyEventToShortcut(makeEvent({ code: "F5" }), {
      isMac: false,
    });
    expect(shortcut).toBe("F5");
  });

  it("captures named keys (arrows)", () => {
    expect(
      keyEventToShortcut(
        makeEvent({ code: "ArrowLeft", ctrlKey: true, shiftKey: true }),
        { isMac: false },
      ),
    ).toBe("Ctrl+Shift+Left");
  });

  it("captures media keys without modifiers", () => {
    expect(
      keyEventToShortcut(makeEvent({ code: "MediaTrackNext" }), {
        isMac: false,
      }),
    ).toBe("MediaNextTrack");
  });

  it("emits Command for metaKey on Mac", () => {
    const shortcut = keyEventToShortcut(
      makeEvent({ code: "KeyP", metaKey: true, shiftKey: true }),
      { isMac: true },
    );
    expect(shortcut).toBe("Command+Shift+P");
  });

  it("emits MacCtrl for ctrlKey on Mac", () => {
    const shortcut = keyEventToShortcut(
      makeEvent({ code: "KeyY", ctrlKey: true }),
      { isMac: true },
    );
    expect(shortcut).toBe("MacCtrl+Y");
  });

  it("ignores metaKey on non-Mac (Windows key is not bindable)", () => {
    const shortcut = keyEventToShortcut(
      makeEvent({ code: "KeyP", metaKey: true, altKey: true }),
      { isMac: false },
    );
    expect(shortcut).toBe("Alt+P");
  });

  it("orders modifiers as Primary, Alt, Shift", () => {
    expect(
      keyEventToShortcut(
        makeEvent({
          code: "KeyP",
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
        }),
        { isMac: false },
      ),
    ).toBe("Ctrl+Alt+Shift+P");
  });
});

describe("validateShortcut", () => {
  it("rejects an empty string", () => {
    const result = validateShortcut("");
    expect(result.ok).toBe(false);
  });

  it("accepts a typical Ctrl+Shift+letter combo", () => {
    expect(validateShortcut("Ctrl+Shift+P")).toEqual({ ok: true });
  });

  it("accepts a function key without modifiers", () => {
    expect(validateShortcut("F5")).toEqual({ ok: true });
  });

  it("accepts a media key without modifiers", () => {
    expect(validateShortcut("MediaPlayPause")).toEqual({ ok: true });
  });

  it("rejects media keys with modifiers", () => {
    const result = validateShortcut("Ctrl+MediaPlayPause");
    expect(result.ok).toBe(false);
  });

  it("rejects Shift-only on a letter key", () => {
    const result = validateShortcut("Shift+P");
    expect(result.ok).toBe(false);
  });

  it("rejects unknown modifier names", () => {
    const result = validateShortcut("Hyper+P");
    expect(result.ok).toBe(false);
  });

  it("rejects unbindable main keys", () => {
    const result = validateShortcut("Ctrl+Tab");
    expect(result.ok).toBe(false);
  });

  it("rejects multiple primary modifiers", () => {
    const result = validateShortcut("Ctrl+Command+P");
    expect(result.ok).toBe(false);
  });

  it("accepts named keys with modifiers", () => {
    expect(validateShortcut("Ctrl+Shift+Left")).toEqual({ ok: true });
  });
});

describe("findConflict", () => {
  const commands: chrome.commands.Command[] = [
    { name: "play-pause", shortcut: "Alt+Shift+P" },
    { name: "next-track", shortcut: "Alt+Shift+N" },
    { name: "remind-me", shortcut: "Alt+Shift+R" },
  ];

  it("returns the conflicting command when shortcut is taken", () => {
    const conflict = findConflict("Alt+Shift+N", commands, "play-pause");
    expect(conflict?.name).toBe("next-track");
  });

  it("ignores the command being edited", () => {
    const conflict = findConflict("Alt+Shift+P", commands, "play-pause");
    expect(conflict).toBeNull();
  });

  it("returns null when no conflict exists", () => {
    const conflict = findConflict("Alt+Shift+Z", commands, "play-pause");
    expect(conflict).toBeNull();
  });

  it("ignores commands with no shortcut", () => {
    const sparse: chrome.commands.Command[] = [
      { name: "play-pause", shortcut: "Alt+Shift+P" },
      { name: "remind-me", shortcut: "" },
    ];
    const conflict = findConflict("Alt+Shift+P", sparse, "remind-me");
    expect(conflict?.name).toBe("play-pause");
  });
});

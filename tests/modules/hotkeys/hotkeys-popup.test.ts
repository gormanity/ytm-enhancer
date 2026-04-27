import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHotkeysPopupView } from "@/modules/hotkeys/popup";

describe("createHotkeysPopupView", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      commands: {
        getAll: vi.fn(),
      },
    });
  });

  it("should return a popup view with correct metadata", () => {
    const view = createHotkeysPopupView();

    expect(view.id).toBe("hotkeys-settings");
    expect(view.label).toBe("Hotkeys");
  });

  it("should render a heading into the container", () => {
    const view = createHotkeysPopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Keyboard Shortcuts");
  });

  it("should render current shortcut bindings", async () => {
    vi.mocked(chrome.commands.getAll).mockImplementation(
      (cb: (commands: chrome.commands.Command[]) => void) => {
        cb([
          {
            name: "play-pause",
            shortcut: "Alt+Shift+P",
            description: "Play or pause",
          },
          {
            name: "next-track",
            shortcut: "Alt+Shift+N",
            description: "Next track",
          },
        ]);
      },
    );

    const view = createHotkeysPopupView();
    const container = document.createElement("div");

    view.render(container);

    // Wait for async rendering
    await vi.waitFor(() => {
      const shortcuts = container.querySelectorAll(".shortcut-row");
      expect(shortcuts.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("should expose a Configure Shortcuts button on Chromium", () => {
    vi.mocked(chrome.commands.getAll).mockImplementation(
      (cb: (commands: chrome.commands.Command[]) => void) => {
        cb([]);
      },
    );

    const view = createHotkeysPopupView();
    const container = document.createElement("div");
    view.render(container);

    const button = container.querySelector<HTMLButtonElement>(
      '[data-role="configure-shortcuts"]',
    );
    const actions = container.querySelector<HTMLElement>(
      '[data-role="configure-shortcuts-actions"]',
    );

    expect(button).not.toBeNull();
    expect(actions?.classList.contains("is-hidden")).toBe(false);
  });

  describe("modifier display on macOS", () => {
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform");
      Object.defineProperty(navigator, "platform", {
        value: "MacIntel",
        configurable: true,
      });
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(navigator, "platform", originalPlatform);
      }
    });

    it("should normalize Firefox text modifiers to Mac symbols", async () => {
      vi.mocked(chrome.commands.getAll).mockImplementation(
        (cb: (commands: chrome.commands.Command[]) => void) => {
          cb([
            {
              name: "focus-ytm-tab",
              shortcut: "MacCtrl+Y",
              description: "Focus the YouTube Music tab",
            },
            {
              name: "remind-me",
              shortcut: "Command+Alt+Shift+P",
              description: "Show a notification",
            },
          ]);
        },
      );

      const view = createHotkeysPopupView();
      const container = document.createElement("div");

      view.render(container);

      await vi.waitFor(() => {
        const keys = Array.from(
          container.querySelectorAll<HTMLElement>(".shortcut-key"),
        ).map((el) => el.textContent);
        expect(keys).toContain("⌃");
        expect(keys).toContain("⌘");
        expect(keys).toContain("⌥");
        expect(keys).toContain("⇧");
        expect(keys).not.toContain("MacCtrl");
        expect(keys).not.toContain("Command");
        expect(keys).not.toContain("Alt");
        expect(keys).not.toContain("Shift");
      });
    });

    it("should pass Chrome's pre-symbolized shortcuts through unchanged", async () => {
      vi.mocked(chrome.commands.getAll).mockImplementation(
        (cb: (commands: chrome.commands.Command[]) => void) => {
          cb([
            {
              name: "play-pause",
              shortcut: "⌥⇧P",
              description: "Play or pause",
            },
          ]);
        },
      );

      const view = createHotkeysPopupView();
      const container = document.createElement("div");

      view.render(container);

      await vi.waitFor(() => {
        const text = container.textContent ?? "";
        expect(text).toContain("⌥");
        expect(text).toContain("⇧");
        expect(text).toContain("P");
      });
    });
  });

  describe.each([
    ["Linux", "Linux x86_64"],
    ["Windows", "Win32"],
  ])("modifier display on %s", (_label, platform) => {
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform");
      Object.defineProperty(navigator, "platform", {
        value: platform,
        configurable: true,
      });
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(navigator, "platform", originalPlatform);
      }
    });

    it("should keep text modifier labels and not introduce Mac symbols", async () => {
      vi.mocked(chrome.commands.getAll).mockImplementation(
        (cb: (commands: chrome.commands.Command[]) => void) => {
          cb([
            {
              name: "play-pause",
              shortcut: "Ctrl+Shift+P",
              description: "Play or pause",
            },
          ]);
        },
      );

      const view = createHotkeysPopupView();
      const container = document.createElement("div");

      view.render(container);

      await vi.waitFor(() => {
        const keys = Array.from(
          container.querySelectorAll<HTMLElement>(".shortcut-key"),
        ).map((el) => el.textContent);
        expect(keys).toContain("Ctrl");
        expect(keys).toContain("Shift");
        expect(keys).not.toContain("⌃");
        expect(keys).not.toContain("⇧");
      });
    });
  });

  describe("Firefox inline editor", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "platform", {
        value: "Linux x86_64",
        configurable: true,
      });
    });

    function setupCommands(commands: chrome.commands.Command[]) {
      const update = vi.fn().mockResolvedValue(undefined);
      const reset = vi.fn().mockResolvedValue(undefined);
      const getAll = vi.fn((cb?: (cmds: chrome.commands.Command[]) => void) => {
        cb?.(commands);
      });
      vi.stubGlobal("chrome", {
        commands: { getAll, update, reset },
        tabs: { create: vi.fn() },
      });
      return { update, reset, getAll };
    }

    function makeKeydown(init: KeyboardEventInit & { code: string }) {
      return new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
    }

    it("hides the Configure Shortcuts button when editing is supported", async () => {
      setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      await vi.waitFor(() => {
        const actions = container.querySelector<HTMLElement>(
          '[data-role="configure-shortcuts-actions"]',
        );
        expect(actions?.classList.contains("is-hidden")).toBe(true);
      });
    });

    it("shows per-row Edit and Reset buttons", async () => {
      setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      await vi.waitFor(() => {
        const editBtn = container.querySelector(
          '[data-role="shortcut-edit-btn"]',
        );
        const resetBtn = container.querySelector(
          '[data-role="shortcut-reset-btn"]',
        );
        const actions = container.querySelector<HTMLElement>(
          '[data-role="shortcut-actions"]',
        );
        expect(editBtn).not.toBeNull();
        expect(resetBtn).not.toBeNull();
        expect(actions?.classList.contains("is-hidden")).toBe(false);
      });
    });

    it("enters edit mode when Edit is clicked", async () => {
      setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      const row = await vi.waitFor(() => {
        const r = container.querySelector<HTMLElement>(".shortcut-row");
        if (!r) throw new Error("not yet");
        return r;
      });

      row
        .querySelector<HTMLButtonElement>('[data-role="shortcut-edit-btn"]')!
        .click();

      const right = row.querySelector<HTMLElement>(".shortcut-row-right");
      expect(right?.dataset.mode).toBe("edit");
    });

    it("captures a valid combo and saves via commands.update", async () => {
      const { update } = setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      const row = await vi.waitFor(() => {
        const r = container.querySelector<HTMLElement>(".shortcut-row");
        if (!r) throw new Error("not yet");
        return r;
      });

      row
        .querySelector<HTMLButtonElement>('[data-role="shortcut-edit-btn"]')!
        .click();

      document.dispatchEvent(
        makeKeydown({
          code: "KeyM",
          ctrlKey: true,
          shiftKey: true,
        }),
      );

      await vi.waitFor(() => {
        expect(update).toHaveBeenCalledWith({
          name: "play-pause",
          shortcut: "Ctrl+Shift+M",
        });
      });
    });

    it("ignores modifier-only keypresses while editing", async () => {
      const { update } = setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      const row = await vi.waitFor(() => {
        const r = container.querySelector<HTMLElement>(".shortcut-row");
        if (!r) throw new Error("not yet");
        return r;
      });

      row
        .querySelector<HTMLButtonElement>('[data-role="shortcut-edit-btn"]')!
        .click();
      document.dispatchEvent(
        makeKeydown({ code: "ControlLeft", ctrlKey: true }),
      );
      document.dispatchEvent(
        makeKeydown({ code: "ShiftLeft", shiftKey: true }),
      );

      expect(update).not.toHaveBeenCalled();
    });

    it("Esc cancels edit mode without saving", async () => {
      const { update } = setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      const row = await vi.waitFor(() => {
        const r = container.querySelector<HTMLElement>(".shortcut-row");
        if (!r) throw new Error("not yet");
        return r;
      });

      row
        .querySelector<HTMLButtonElement>('[data-role="shortcut-edit-btn"]')!
        .click();
      document.dispatchEvent(makeKeydown({ code: "Escape", key: "Escape" }));

      const right = row.querySelector<HTMLElement>(".shortcut-row-right");
      expect(right?.dataset.mode).toBe("display");
      expect(update).not.toHaveBeenCalled();
    });

    it("Cancel button exits edit mode without saving", async () => {
      const { update } = setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      const row = await vi.waitFor(() => {
        const r = container.querySelector<HTMLElement>(".shortcut-row");
        if (!r) throw new Error("not yet");
        return r;
      });

      row
        .querySelector<HTMLButtonElement>('[data-role="shortcut-edit-btn"]')!
        .click();
      row
        .querySelector<HTMLButtonElement>('[data-role="shortcut-cancel-btn"]')!
        .click();

      const right = row.querySelector<HTMLElement>(".shortcut-row-right");
      expect(right?.dataset.mode).toBe("display");
      expect(update).not.toHaveBeenCalled();
    });

    it("Reset button calls commands.reset with the command name", async () => {
      const { reset } = setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      const row = await vi.waitFor(() => {
        const r = container.querySelector<HTMLElement>(".shortcut-row");
        if (!r) throw new Error("not yet");
        return r;
      });

      row
        .querySelector<HTMLButtonElement>('[data-role="shortcut-reset-btn"]')!
        .click();

      expect(reset).toHaveBeenCalledWith("play-pause");
    });

    it("rejects shortcuts that conflict with another command", async () => {
      const { update } = setupCommands([
        { name: "play-pause", shortcut: "Alt+Shift+P", description: "Play" },
        { name: "next-track", shortcut: "Ctrl+Shift+M", description: "Next" },
      ]);

      const view = createHotkeysPopupView();
      const container = document.createElement("div");
      view.render(container);

      const row = await vi.waitFor(() => {
        const r = container.querySelector<HTMLElement>(".shortcut-row");
        if (!r) throw new Error("not yet");
        return r;
      });

      row
        .querySelector<HTMLButtonElement>('[data-role="shortcut-edit-btn"]')!
        .click();
      document.dispatchEvent(
        makeKeydown({ code: "KeyM", ctrlKey: true, shiftKey: true }),
      );

      await vi.waitFor(() => {
        const error = row.querySelector<HTMLElement>(
          '[data-role="shortcut-error"]',
        );
        expect(error?.classList.contains("is-hidden")).toBe(false);
        expect(error?.textContent).toContain("Next");
      });
      expect(update).not.toHaveBeenCalled();
    });
  });

  it("should show 'Not set' for unbound shortcuts", async () => {
    vi.mocked(chrome.commands.getAll).mockImplementation(
      (cb: (commands: chrome.commands.Command[]) => void) => {
        cb([
          { name: "play-pause", shortcut: "", description: "Play or pause" },
        ]);
      },
    );

    const view = createHotkeysPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Not set");
    });
  });
});

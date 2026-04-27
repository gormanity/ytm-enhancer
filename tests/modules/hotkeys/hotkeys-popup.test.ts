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
    const instructions = container.querySelector<HTMLElement>(
      '[data-role="firefox-shortcuts-instructions"]',
    );

    expect(button).not.toBeNull();
    expect(actions?.classList.contains("is-hidden")).toBe(false);
    expect(instructions?.classList.contains("is-hidden")).toBe(true);
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

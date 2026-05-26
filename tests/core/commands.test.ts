import { afterEach, describe, expect, it, vi } from "vitest";
import { createShortcutCommandClient } from "@/core/commands";

describe("createShortcutCommandClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports editing support when command update is available", () => {
    vi.stubGlobal("chrome", {
      commands: {
        update: vi.fn(),
      },
    });

    expect(createShortcutCommandClient().canEdit()).toBe(true);
  });

  it("lists registered browser commands", async () => {
    vi.stubGlobal("chrome", {
      commands: {
        getAll: vi.fn((cb: (commands: chrome.commands.Command[]) => void) => {
          cb([{ name: "play-pause", shortcut: "Alt+Shift+P" }]);
        }),
      },
    });

    await expect(createShortcutCommandClient().getAll()).resolves.toEqual([
      { name: "play-pause", shortcut: "Alt+Shift+P" },
    ]);
  });

  it("opens the browser shortcuts page", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      tabs: { create },
    });

    await createShortcutCommandClient().openShortcutsPage();

    expect(create).toHaveBeenCalledWith({
      url: "chrome://extensions/shortcuts",
    });
  });
});

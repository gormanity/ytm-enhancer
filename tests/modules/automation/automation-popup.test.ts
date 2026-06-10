import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAutomationPopupView } from "@/modules/automation/popup";
import type { AutoPlayClient } from "@/modules/auto-play/client";
import type { AutoSkipDislikedClient } from "@/modules/auto-skip-disliked/client";
import { createTestModuleContext } from "../../helpers/module-context";

const popupCss = readFileSync(
  resolve(process.cwd(), "src/popup/index.css"),
  "utf-8",
);

function createClients(options?: {
  autoPlayMode?: "default" | "off" | "on";
  autoSkipEnabled?: boolean;
}) {
  let statusChanged: () => void = () => undefined;
  const autoPlay: AutoPlayClient = {
    getMode: vi.fn().mockResolvedValue(options?.autoPlayMode ?? "default"),
    setMode: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ browserAutoplayBlocked: false }),
    subscribeStatusChanged: vi.fn((listener) => {
      statusChanged = listener;
      return vi.fn();
    }),
  };
  const autoSkipDisliked: AutoSkipDislikedClient = {
    isEnabled: vi.fn().mockResolvedValue(options?.autoSkipEnabled ?? false),
    setEnabled: vi.fn().mockResolvedValue(undefined),
  };
  return { autoPlay, autoSkipDisliked, statusChanged: () => statusChanged() };
}

describe("automation popup view", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    });
  });

  it("returns the combined popup view metadata", () => {
    const view = createAutomationPopupView(createTestModuleContext());

    expect(view.id).toBe("automation-settings");
    expect(view.label).toBe("Automation");
  });

  it("renders automation controls in one flat card", async () => {
    const clients = createClients({
      autoPlayMode: "on",
      autoSkipEnabled: true,
    });
    const view = createAutomationPopupView(createTestModuleContext(), clients);
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(container.querySelector("h2")?.textContent).toBe("Automation");
      expect(container.querySelectorAll(".settings-card")).toHaveLength(1);
      expect(container.querySelector("h3")).toBeNull();
      expect(container.textContent).toContain("Auto-play on page load");
      expect(container.textContent).toContain(
        "Automatically skip disliked songs",
      );
      expect(
        container.querySelector<HTMLSelectElement>(
          '[data-role="automation-auto-play-mode"]',
        )?.value,
      ).toBe("on");
      expect(
        container.querySelector<HTMLInputElement>(
          '[data-role="automation-auto-skip-disliked-toggle"]',
        )?.checked,
      ).toBe(true);
    });
  });

  it("keeps a divider below the Auto-Play row", () => {
    expect(popupCss).toMatch(
      /\.automation-card\s*>\s*\.auto-play-mode-row\s*\{[^}]*border-bottom:\s*1px solid var\(--border-color\);/s,
    );
  });

  it.each([
    ["default", "Use YouTube Music's normal startup playback behavior."],
    [
      "off",
      "Prevent playback from starting automatically when YouTube Music loads.",
    ],
    [
      "on",
      "Start playback automatically when YouTube Music loads with music ready to play.",
    ],
  ] as const)("explains the %s Auto-Play mode", async (autoPlayMode, text) => {
    const clients = createClients({ autoPlayMode });
    const view = createAutomationPopupView(createTestModuleContext(), clients);
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      expect(
        container.querySelector<HTMLElement>(
          '[data-role="automation-auto-play-mode-hint"]',
        )?.textContent,
      ).toBe(text);
    });
  });

  it("updates the Auto-Play mode helper text when the mode changes", async () => {
    const clients = createClients({ autoPlayMode: "default" });
    const view = createAutomationPopupView(createTestModuleContext(), clients);
    const container = document.createElement("div");

    view.render(container);

    const select = await vi.waitFor(() => {
      const element = container.querySelector<HTMLSelectElement>(
        '[data-role="automation-auto-play-mode"]',
      );
      expect(element?.disabled).toBe(false);
      return element!;
    });

    select.value = "on";
    select.dispatchEvent(new Event("change"));

    expect(
      container.querySelector<HTMLElement>(
        '[data-role="automation-auto-play-mode-hint"]',
      )?.textContent,
    ).toBe(
      "Start playback automatically when YouTube Music loads with music ready to play.",
    );
  });

  it("persists Auto-Play mode changes through the Auto-Play client", async () => {
    const clients = createClients();
    const view = createAutomationPopupView(createTestModuleContext(), clients);
    const container = document.createElement("div");

    view.render(container);

    const select = await vi.waitFor(() => {
      const element = container.querySelector<HTMLSelectElement>(
        '[data-role="automation-auto-play-mode"]',
      );
      expect(element?.disabled).toBe(false);
      return element!;
    });
    select.value = "off";
    select.dispatchEvent(new Event("change"));

    expect(clients.autoPlay.setMode).toHaveBeenCalledWith("off");
  });

  it("persists Auto-Skip Disliked changes through its client", async () => {
    const clients = createClients();
    const view = createAutomationPopupView(createTestModuleContext(), clients);
    const container = document.createElement("div");

    view.render(container);

    const toggle = await vi.waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(
        '[data-role="automation-auto-skip-disliked-toggle"]',
      );
      expect(element?.disabled).toBe(false);
      return element!;
    });
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));

    expect(clients.autoSkipDisliked.setEnabled).toHaveBeenCalledWith(true);
  });
});

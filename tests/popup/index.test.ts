import { beforeEach, describe, expect, it, vi } from "vitest";

const renderOne = vi.fn();
const renderAbout = vi.fn();
const renderAutomation = vi.fn();
const cleanupOne = vi.fn();
const renderTwo = vi.fn();
const extensionStorage: Record<string, unknown> = {};
type RuntimeSendMessageMock = (
  message: unknown,
  callback?: (response: unknown) => void,
) => void;

vi.mock("@/modules/popup-views", () => ({
  getAllPopupViews: () => [
    {
      id: "one",
      label: "One",
      render: (container: HTMLElement) => {
        renderOne(container);
        return cleanupOne;
      },
    },
    {
      id: "automation-settings",
      label: "Automation",
      render: (container: HTMLElement) => {
        renderAutomation(container);
      },
    },
    {
      id: "about",
      label: "About",
      render: (container: HTMLElement) => {
        renderAbout(container);
      },
    },
    {
      id: "two",
      label: "Two",
      render: (container: HTMLElement) => {
        renderTwo(container);
      },
    },
  ],
}));

describe("popup index", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/core/build-info", () => ({
      isDevBuild: () => true,
    }));
    renderOne.mockReset();
    renderAbout.mockReset();
    renderAutomation.mockReset();
    cleanupOne.mockReset();
    renderTwo.mockReset();
    for (const key of Object.keys(extensionStorage)) {
      delete extensionStorage[key];
    }
    vi.stubGlobal("chrome", {
      runtime: {
        lastError: undefined,
        onMessage: {
          addListener: vi.fn(),
        },
        sendMessage: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn((keys: string[], callback) => {
            callback(
              Object.fromEntries(
                keys.map((key) => [key, extensionStorage[key]]),
              ),
            );
          }),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(extensionStorage, items);
          }),
        },
      },
    });
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });
    document.body.innerHTML = `
      <h1 data-role="app-title">YTM Enhancer</h1>
      <div id="dev-build-conflict-banner" class="is-hidden"></div>
      <div id="view-container"></div>
      <nav id="nav-list"></nav>
      <template id="nav-item-template">
        <div class="nav-item">
          <span data-role="icon"></span>
          <span data-role="label"></span>
        </div>
      </template>
    `;
  });

  it("runs previous view cleanup when switching views", async () => {
    await import("../../src/popup/index");

    const navItems = document.querySelectorAll(".nav-item");
    expect(navItems).toHaveLength(4);
    (navItems[3] as HTMLElement).click();

    expect(cleanupOne).toHaveBeenCalledTimes(1);
  });

  it("shows a dev build badge next to the app title in dev builds", async () => {
    await import("../../src/popup/index");

    const title = document.querySelector<HTMLElement>(
      '[data-role="app-title"]',
    );
    const badge = title?.querySelector<HTMLElement>(".dev-build-badge");

    expect(badge?.textContent).toBe("DEV");
  });

  it("shows a duplicate install banner in production when the runtime is suspended", async () => {
    vi.doMock("@/core/build-info", () => ({
      isDevBuild: () => false,
    }));
    (
      chrome.runtime.sendMessage as unknown as {
        mockImplementation: (implementation: RuntimeSendMessageMock) => void;
      }
    ).mockImplementation((_message, callback) => {
      callback?.({
        ok: true,
        data: { duplicateDetected: true },
      });
    });

    await import("../../src/popup/index");

    const banner = document.getElementById("dev-build-conflict-banner");
    expect(banner?.classList.contains("is-hidden")).toBe(false);
  });

  it("shows a notification indicator on About before the review prompt is accessed", async () => {
    await import("../../src/popup/index");

    const aboutItem = document.querySelector<HTMLElement>(
      '[data-view-id="about"]',
    );
    expect(aboutItem?.classList.contains("has-notification")).toBe(true);
  });

  it("hides the About notification indicator after About is opened", async () => {
    await import("../../src/popup/index");

    const aboutItem = document.querySelector<HTMLElement>(
      '[data-view-id="about"]',
    );
    aboutItem?.click();

    const updatedAboutItem = document.querySelector<HTMLElement>(
      '[data-view-id="about"]',
    );
    expect(extensionStorage["about.reviewPromptAccessed"]).toBe(true);
    expect(updatedAboutItem?.classList.contains("has-notification")).toBe(
      false,
    );
  });

  it("does not show the About notification indicator after the review prompt is dismissed", async () => {
    extensionStorage["about.reviewPromptDismissed"] = true;

    await import("../../src/popup/index");

    const aboutItem = document.querySelector<HTMLElement>(
      '[data-view-id="about"]',
    );
    expect(aboutItem?.classList.contains("has-notification")).toBe(false);
  });

  it("marks the review prompt accessed when About is the restored view", async () => {
    localStorage.setItem("active-view-id", "about");

    await import("../../src/popup/index");

    const aboutItem = document.querySelector<HTMLElement>(
      '[data-view-id="about"]',
    );
    expect(extensionStorage["about.reviewPromptAccessed"]).toBe(true);
    expect(aboutItem?.classList.contains("has-notification")).toBe(false);
  });

  it.each(["auto-play-settings", "auto-skip-disliked-settings"])(
    "restores legacy %s as the Automation view",
    async (legacyViewId) => {
      localStorage.setItem("active-view-id", legacyViewId);

      await import("../../src/popup/index");

      const automationItem = document.querySelector<HTMLElement>(
        '[data-view-id="automation-settings"]',
      );
      expect(renderAutomation).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("active-view-id")).toBe(
        "automation-settings",
      );
      expect(automationItem?.classList.contains("active")).toBe(true);
    },
  );
});

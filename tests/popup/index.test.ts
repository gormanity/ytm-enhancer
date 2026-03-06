import { beforeEach, describe, expect, it, vi } from "vitest";

const renderOne = vi.fn();
const cleanupOne = vi.fn();
const renderTwo = vi.fn();

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
    renderOne.mockReset();
    cleanupOne.mockReset();
    renderTwo.mockReset();
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
      <div id="view-container"></div>
      <nav id="nav-list"></nav>
    `;
  });

  it("runs previous view cleanup when switching views", async () => {
    await import("../../src/popup/index.ts");

    const navItems = document.querySelectorAll(".nav-item");
    expect(navItems).toHaveLength(2);
    (navItems[1] as HTMLElement).click();

    expect(cleanupOne).toHaveBeenCalledTimes(1);
  });
});

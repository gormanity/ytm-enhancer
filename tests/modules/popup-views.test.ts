import { beforeEach, describe, expect, it, vi } from "vitest";

describe("module popup view registry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: {
        getManifest: () => ({ version: "0.0.0" }),
        getURL: (path: string) => path,
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
    });
  });

  it("combines Auto-Play and Auto-Skip Disliked into Automation", async () => {
    const { getAllPopupViews } = await import("@/modules/popup-views");
    const labels = getAllPopupViews().map((view) => view.label);

    expect(labels).toContain("Automation");
    expect(labels).not.toContain("Auto-Play");
    expect(labels).not.toContain("Auto-Skip Disliked");
  });
});

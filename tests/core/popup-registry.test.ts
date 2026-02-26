import { describe, it, expect, vi } from "vitest";
import { PopupRegistry } from "@/core/popup-registry";
import type { PopupView } from "@/core/types";

function createMockView(id: string): PopupView {
  return {
    id,
    label: `View ${id}`,
    render: vi.fn(),
  };
}

describe("PopupRegistry", () => {
  it("should register and retrieve a popup view", () => {
    const registry = new PopupRegistry();
    const view = createMockView("settings");

    registry.register(view);

    expect(registry.get("settings")).toBe(view);
  });

  it("should return all registered views", () => {
    const registry = new PopupRegistry();
    const viewA = createMockView("a");
    const viewB = createMockView("b");

    registry.register(viewA);
    registry.register(viewB);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(viewA);
    expect(all).toContain(viewB);
  });

  it("should throw when registering a duplicate view id", () => {
    const registry = new PopupRegistry();
    const view = createMockView("settings");

    registry.register(view);

    expect(() => registry.register(view)).toThrow(
      "Popup view already registered: settings",
    );
  });

  it("should unregister a view", () => {
    const registry = new PopupRegistry();
    const view = createMockView("settings");

    registry.register(view);
    registry.unregister("settings");

    expect(registry.get("settings")).toBeUndefined();
  });

  it("should return undefined for unregistered view", () => {
    const registry = new PopupRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });
});

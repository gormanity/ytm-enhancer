import { describe, it, expect, vi } from "vitest";
import { ModuleRegistry } from "@/core/registry";
import { FeatureModule } from "@/core/types";

function createMockModule(id: string): FeatureModule {
  return {
    id,
    name: `Test Module ${id}`,
    description: `A test module with id ${id}`,
    init: vi.fn(),
    destroy: vi.fn(),
    isEnabled: vi.fn(() => true),
    setEnabled: vi.fn(),
  };
}

describe("ModuleRegistry", () => {
  it("should register and retrieve a module", () => {
    const registry = new ModuleRegistry();
    const module = createMockModule("test");

    registry.register(module);

    expect(registry.get("test")).toBe(module);
    expect(registry.has("test")).toBe(true);
  });

  it("should throw when registering a duplicate module id", () => {
    const registry = new ModuleRegistry();
    const module = createMockModule("test");

    registry.register(module);

    expect(() => registry.register(module)).toThrow(
      "Module already registered: test",
    );
  });

  it("should unregister a module", () => {
    const registry = new ModuleRegistry();
    const module = createMockModule("test");

    registry.register(module);
    registry.unregister("test");

    expect(registry.has("test")).toBe(false);
    expect(registry.get("test")).toBeUndefined();
  });

  it("should return all registered modules", () => {
    const registry = new ModuleRegistry();
    const moduleA = createMockModule("a");
    const moduleB = createMockModule("b");

    registry.register(moduleA);
    registry.register(moduleB);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(moduleA);
    expect(all).toContain(moduleB);
  });

  it("should return undefined for unregistered module", () => {
    const registry = new ModuleRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });
});

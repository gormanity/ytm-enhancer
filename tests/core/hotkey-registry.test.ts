import { describe, it, expect, vi } from "vitest";
import { HotkeyRegistry } from "@/core/hotkey-registry";

describe("HotkeyRegistry", () => {
  it("should call the registered handler on dispatch", async () => {
    const registry = new HotkeyRegistry();
    const handler = vi.fn();

    registry.register("play-pause", handler);
    await registry.dispatch("play-pause");

    expect(handler).toHaveBeenCalledWith("play-pause");
  });

  it("should be a no-op for unregistered commands", async () => {
    const registry = new HotkeyRegistry();

    await expect(registry.dispatch("unknown-command")).resolves.toBeUndefined();
  });

  it("should throw on duplicate command registration", () => {
    const registry = new HotkeyRegistry();
    registry.register("play-pause", vi.fn());

    expect(() => registry.register("play-pause", vi.fn())).toThrow(
      'Command "play-pause" is already registered',
    );
  });

  it("should return true for registered commands via has()", () => {
    const registry = new HotkeyRegistry();
    registry.register("play-pause", vi.fn());

    expect(registry.has("play-pause")).toBe(true);
  });

  it("should return false for unregistered commands via has()", () => {
    const registry = new HotkeyRegistry();

    expect(registry.has("play-pause")).toBe(false);
  });

  it("should pass the command string as argument to handler", async () => {
    const registry = new HotkeyRegistry();
    const handler = vi.fn();

    registry.register("next-track", handler);
    await registry.dispatch("next-track");

    expect(handler).toHaveBeenCalledWith("next-track");
  });
});

import { describe, expect, it, vi } from "vitest";
import { AlarmRegistry } from "@/core/alarm-registry";

describe("AlarmRegistry", () => {
  it("dispatches matching alarms to registered handlers", async () => {
    const registry = new AlarmRegistry();
    const handler = vi.fn().mockResolvedValue(undefined);

    registry.register("sleep-timer", handler);

    await expect(
      registry.dispatch({ name: "sleep-timer", scheduledTime: 123 }),
    ).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith({
      name: "sleep-timer",
      scheduledTime: 123,
    });
  });

  it("returns false when no handler owns the alarm", async () => {
    const registry = new AlarmRegistry();

    await expect(registry.dispatch({ name: "unknown" })).resolves.toBe(false);
  });
});

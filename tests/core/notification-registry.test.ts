import { describe, expect, it, vi } from "vitest";
import { NotificationClickRegistry } from "@/core/notifications";

describe("NotificationClickRegistry", () => {
  it("dispatches matching notification clicks to registered handlers", async () => {
    const registry = new NotificationClickRegistry();
    const handler = vi.fn().mockResolvedValue(undefined);

    registry.register("now-playing", handler);

    await expect(registry.dispatch("now-playing")).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith("now-playing");
  });

  it("returns false when no handler owns the notification click", async () => {
    const registry = new NotificationClickRegistry();

    await expect(registry.dispatch("unknown")).resolves.toBe(false);
  });
});

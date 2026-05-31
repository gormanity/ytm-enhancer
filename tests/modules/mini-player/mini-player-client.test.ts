import { describe, expect, it, vi } from "vitest";
import { createMiniPlayerClient } from "@/modules/mini-player/client";
import type { RuntimeClient } from "@/core/messaging";

function createRuntime(): RuntimeClient {
  return {
    request: vi.fn().mockResolvedValue(true),
    command: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
}

describe("MiniPlayerClient", () => {
  it("should read enabled state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createMiniPlayerClient(runtime);

    await expect(client.isEnabled()).resolves.toBe(true);

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-mini-player-enabled",
    });
  });

  it("should write enabled state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createMiniPlayerClient(runtime);

    await client.setEnabled(false);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-mini-player-enabled",
      enabled: false,
    });
  });

  it("should read notification suppression through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createMiniPlayerClient(runtime);

    await expect(client.getSuppressNotifications()).resolves.toBe(true);

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-mini-player-suppress-notifications",
    });
  });

  it("should write notification suppression through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createMiniPlayerClient(runtime);

    await client.setSuppressNotifications(true);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-mini-player-suppress-notifications",
      enabled: true,
    });
  });
});

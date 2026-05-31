import { describe, expect, it, vi } from "vitest";
import { createAutoSkipDislikedClient } from "@/modules/auto-skip-disliked/client";
import type { RuntimeClient } from "@/core/messaging";

function createRuntime(): RuntimeClient {
  return {
    request: vi.fn().mockResolvedValue(true),
    command: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
}

describe("AutoSkipDislikedClient", () => {
  it("should read enabled state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAutoSkipDislikedClient(runtime);

    await expect(client.isEnabled()).resolves.toBe(true);

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-auto-skip-disliked-enabled",
    });
  });

  it("should write enabled state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAutoSkipDislikedClient(runtime);

    await client.setEnabled(true);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-auto-skip-disliked-enabled",
      enabled: true,
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createAutoPlayClient } from "@/modules/auto-play/client";
import type { RuntimeClient } from "@/core/messaging";

function createRuntime(): RuntimeClient {
  return {
    request: vi.fn().mockResolvedValue("on"),
    command: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
}

describe("AutoPlayClient", () => {
  it("should read mode through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAutoPlayClient(runtime);

    await expect(client.getMode()).resolves.toBe("on");

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-auto-play-mode",
    });
  });

  it("should normalize unknown mode responses", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.request).mockResolvedValue("unexpected");
    const client = createAutoPlayClient(runtime);

    await expect(client.getMode()).resolves.toBe("default");
  });

  it("should write mode through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createAutoPlayClient(runtime);

    await client.setMode("off");

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-auto-play-mode",
      mode: "off",
    });
  });

  it("should read status through the runtime API", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.request).mockResolvedValue({
      browserAutoplayBlocked: true,
    });
    const client = createAutoPlayClient(runtime);

    await expect(client.getStatus()).resolves.toEqual({
      browserAutoplayBlocked: true,
    });

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-auto-play-status",
    });
  });

  it("should subscribe to status changes", () => {
    const runtime = createRuntime();
    let runtimeListener: (message: { type: string }) => void = () => undefined;
    vi.mocked(runtime.subscribe).mockImplementation((listener) => {
      runtimeListener = listener as (message: { type: string }) => void;
      return vi.fn();
    });
    const onStatusChanged = vi.fn();
    const client = createAutoPlayClient(runtime);

    client.subscribeStatusChanged(onStatusChanged);
    runtimeListener({ type: "unrelated" });
    runtimeListener({ type: "auto-play-status-changed" });

    expect(onStatusChanged).toHaveBeenCalledTimes(1);
  });
});

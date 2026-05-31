import { describe, expect, it, vi } from "vitest";
import { createSleepTimerClient } from "@/modules/sleep-timer/client";
import type { RuntimeClient } from "@/core/messaging";

function createRuntime(): RuntimeClient {
  return {
    request: vi.fn().mockResolvedValue(true),
    command: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
}

describe("SleepTimerClient", () => {
  it("should read timer state through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createSleepTimerClient(runtime);

    await client.getState();

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-sleep-timer-state",
    });
  });

  it("should start timers through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createSleepTimerClient(runtime);

    await client.start(30000);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "start-sleep-timer",
      durationMs: 30000,
    });
  });

  it("should cancel timers through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createSleepTimerClient(runtime);

    await client.cancel();

    expect(runtime.command).toHaveBeenCalledWith({
      type: "cancel-sleep-timer",
    });
  });

  it("should read notification setting through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createSleepTimerClient(runtime);

    await expect(client.getNotifyOnEnd()).resolves.toBe(true);

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-sleep-timer-notify-enabled",
    });
  });

  it("should write notification setting through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createSleepTimerClient(runtime);

    await client.setNotifyOnEnd(false);

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-sleep-timer-notify-enabled",
      enabled: false,
    });
  });

  it("should read mode through the runtime API", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.request).mockResolvedValue("absolute");
    const client = createSleepTimerClient(runtime);

    await expect(client.getMode()).resolves.toBe("absolute");

    expect(runtime.request).toHaveBeenCalledWith({
      type: "get-sleep-timer-mode",
    });
  });

  it("should normalize unknown modes", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.request).mockResolvedValue("other");
    const client = createSleepTimerClient(runtime);

    await expect(client.getMode()).resolves.toBe("duration");
  });

  it("should write mode through the runtime API", async () => {
    const runtime = createRuntime();
    const client = createSleepTimerClient(runtime);

    await client.setMode("absolute");

    expect(runtime.command).toHaveBeenCalledWith({
      type: "set-sleep-timer-mode",
      mode: "absolute",
    });
  });

  it("should subscribe to state changes", () => {
    const runtime = createRuntime();
    let runtimeListener: (message: { type?: string }) => void = () => undefined;
    vi.mocked(runtime.subscribe).mockImplementation((listener) => {
      runtimeListener = listener as (message: { type?: string }) => void;
      return vi.fn();
    });
    const listener = vi.fn();
    const client = createSleepTimerClient(runtime);

    client.subscribeStateChanged(listener);
    runtimeListener({ type: "unrelated" });
    runtimeListener({ type: "sleep-timer-state-changed" });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

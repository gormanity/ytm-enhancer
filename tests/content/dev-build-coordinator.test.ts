import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDevBuildRuntimeCoordinator } from "@/content/dev-build-coordinator";

describe("dev build runtime coordinator", () => {
  function activeContext(callback: (active: boolean) => void): void {
    callback(true);
  }

  function dispatchDevPresence(): void {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "ytm-enhancer:dev-build-presence",
          source: "ytm-enhancer",
          build: "dev",
        },
        source: window,
      }),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts dev runtime immediately and announces dev presence", () => {
    const onResume = vi.fn();
    const onSuspend = vi.fn();
    const postMessage = vi.spyOn(window, "postMessage");

    const stop = createDevBuildRuntimeCoordinator({
      isDevBuild: true,
      onResume,
      onSuspend,
      isExtensionContextActive: activeContext,
      heartbeatMs: 100,
    }).start();

    expect(onResume).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "ytm-enhancer:dev-build-presence",
        source: "ytm-enhancer",
        build: "dev",
      },
      "*",
    );

    vi.advanceTimersByTime(100);

    expect(postMessage).toHaveBeenCalledTimes(2);

    stop();

    expect(onSuspend).toHaveBeenCalledOnce();
  });

  it("stops dev heartbeats when the extension context is invalidated", () => {
    const onResume = vi.fn();
    const onSuspend = vi.fn();
    const postMessage = vi.spyOn(window, "postMessage");
    let contextActive = true;
    const isExtensionContextActive = vi.fn(
      (callback: (active: boolean) => void) => {
        callback(contextActive);
      },
    );

    const stop = createDevBuildRuntimeCoordinator({
      isDevBuild: true,
      onResume,
      onSuspend,
      isExtensionContextActive,
      heartbeatMs: 100,
    }).start();

    expect(postMessage).toHaveBeenCalledTimes(1);

    contextActive = false;
    vi.advanceTimersByTime(100);

    expect(onSuspend).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    stop();

    expect(onSuspend).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("starts prod runtime after the initial grace period when no dev build is present", () => {
    const onResume = vi.fn();
    const onSuspend = vi.fn();

    const stop = createDevBuildRuntimeCoordinator({
      isDevBuild: false,
      onResume,
      onSuspend,
      initialGraceMs: 250,
    }).start();

    vi.advanceTimersByTime(249);
    expect(onResume).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onResume).toHaveBeenCalledOnce();

    stop();
    expect(onSuspend).toHaveBeenCalledOnce();
  });

  it("keeps prod runtime suspended while dev presence is fresh", () => {
    const onResume = vi.fn();
    const onSuspend = vi.fn();

    const stop = createDevBuildRuntimeCoordinator({
      isDevBuild: false,
      onResume,
      onSuspend,
      heartbeatMs: 100,
      initialGraceMs: 250,
      staleMs: 500,
    }).start();

    dispatchDevPresence();
    vi.advanceTimersByTime(250);

    expect(onResume).not.toHaveBeenCalled();
    expect(onSuspend).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(249);
    expect(onResume).not.toHaveBeenCalled();

    vi.advanceTimersByTime(251);
    expect(onResume).toHaveBeenCalledOnce();

    stop();
  });

  it("suspends active prod runtime when dev presence appears", () => {
    const onResume = vi.fn();
    const onSuspend = vi.fn();

    const stop = createDevBuildRuntimeCoordinator({
      isDevBuild: false,
      onResume,
      onSuspend,
      initialGraceMs: 100,
    }).start();

    vi.advanceTimersByTime(100);
    expect(onResume).toHaveBeenCalledOnce();

    dispatchDevPresence();

    expect(onSuspend).toHaveBeenCalledOnce();

    stop();
    expect(onSuspend).toHaveBeenCalledOnce();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDevBuildPresenceCoordinator } from "@/background/dev-build-presence";
import {
  CHROMIUM_LOCAL_DEV_EXTENSION_ID,
  CHROMIUM_LOCAL_PROD_EXTENSION_ID,
  CHROMIUM_STORE_PROD_EXTENSION_ID,
  DEV_BUILD_HOTKEY_COMMAND_MESSAGE,
  DEV_BUILD_PRESENCE_MESSAGE,
  DEV_BUILD_PRESENCE_REQUEST_MESSAGE,
} from "@/runtime-messages";

type ExternalListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createRuntime() {
  let externalListener: ExternalListener | null = null;
  const runtime = {
    lastError: undefined as chrome.runtime.LastError | undefined,
    sendMessage: vi.fn(
      (
        _extensionId: string,
        _message: unknown,
        callback?: (response?: unknown) => void,
      ) => {
        callback?.();
      },
    ),
    onMessageExternal: {
      addListener: vi.fn((listener: ExternalListener) => {
        externalListener = listener;
      }),
    },
  };

  return {
    runtime,
    dispatchExternal(
      message: unknown,
      sender: chrome.runtime.MessageSender,
    ): { listenerResult: boolean | void; response: unknown } {
      const result: { listenerResult: boolean | void; response: unknown } = {
        listenerResult: undefined,
        response: undefined,
      };
      result.listenerResult = externalListener?.(message, sender, (value) => {
        result.response = value;
      });
      return result;
    },
  };
}

describe("dev build cross-extension presence coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("dev pings known production IDs immediately and on interval", () => {
    const { runtime } = createRuntime();
    const coordinator = createDevBuildPresenceCoordinator({
      isDevBuild: true,
      runtime,
      onDevPresent: vi.fn(),
      heartbeatMs: 100,
    });

    coordinator.startDevHeartbeat();

    expect(runtime.sendMessage).toHaveBeenCalledWith(
      CHROMIUM_LOCAL_PROD_EXTENSION_ID,
      { type: DEV_BUILD_PRESENCE_MESSAGE },
      expect.any(Function),
    );
    expect(runtime.sendMessage).toHaveBeenCalledWith(
      CHROMIUM_STORE_PROD_EXTENSION_ID,
      { type: DEV_BUILD_PRESENCE_MESSAGE },
      expect.any(Function),
    );

    vi.advanceTimersByTime(100);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(4);
  });

  it("prod accepts presence only from the known local dev ID", () => {
    const { runtime, dispatchExternal } = createRuntime();
    const onDevPresent = vi.fn();
    const coordinator = createDevBuildPresenceCoordinator({
      isDevBuild: false,
      runtime,
      onDevPresent,
    });
    coordinator.registerExternalListener();

    expect(
      dispatchExternal(
        { type: DEV_BUILD_PRESENCE_MESSAGE },
        { id: "not-the-dev-build" },
      ),
    ).toEqual({ listenerResult: false, response: undefined });
    expect(onDevPresent).not.toHaveBeenCalled();

    expect(
      dispatchExternal(
        { type: DEV_BUILD_PRESENCE_MESSAGE },
        { id: CHROMIUM_LOCAL_DEV_EXTENSION_ID },
      ),
    ).toEqual({ listenerResult: false, response: { ok: true } });
    expect(onDevPresent).toHaveBeenCalledOnce();
  });

  it("keeps prod presence responses open until async state handling finishes", async () => {
    const { runtime, dispatchExternal } = createRuntime();
    const pendingDevPresence = deferred();
    const onDevPresent = vi.fn(() => pendingDevPresence.promise);
    const coordinator = createDevBuildPresenceCoordinator({
      isDevBuild: false,
      runtime,
      onDevPresent,
    });
    coordinator.registerExternalListener();

    const result = dispatchExternal(
      { type: DEV_BUILD_PRESENCE_MESSAGE },
      { id: CHROMIUM_LOCAL_DEV_EXTENSION_ID },
    );

    expect(result).toEqual({ listenerResult: true, response: undefined });
    pendingDevPresence.resolve();
    await Promise.resolve();
    expect(result.response).toEqual({ ok: true });
  });

  it("prod probes dev presence before reporting status", async () => {
    const { runtime } = createRuntime();
    const pendingDevPresence = deferred();
    runtime.sendMessage.mockImplementation(
      (
        _extensionId: string,
        _message: unknown,
        callback?: (response?: unknown) => void,
      ) => {
        callback?.({ ok: true });
      },
    );
    const onDevPresent = vi.fn(() => pendingDevPresence.promise);
    const coordinator = createDevBuildPresenceCoordinator({
      isDevBuild: false,
      runtime,
      onDevPresent,
    });

    const presencePromise = coordinator.probeDevPresence();
    await Promise.resolve();

    expect(runtime.sendMessage).toHaveBeenCalledWith(
      CHROMIUM_LOCAL_DEV_EXTENSION_ID,
      { type: DEV_BUILD_PRESENCE_REQUEST_MESSAGE },
      expect.any(Function),
    );
    expect(onDevPresent).toHaveBeenCalledOnce();

    let settled = false;
    void presencePromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    pendingDevPresence.resolve();
    await presencePromise;
    expect(settled).toBe(true);
  });

  it("dev responds only to known production IDs", () => {
    const { runtime, dispatchExternal } = createRuntime();
    const coordinator = createDevBuildPresenceCoordinator({
      isDevBuild: true,
      runtime,
      onDevPresent: vi.fn(),
    });
    coordinator.registerExternalListener();

    expect(
      dispatchExternal(
        { type: DEV_BUILD_PRESENCE_REQUEST_MESSAGE },
        { id: "unknown-prod-build" },
      ),
    ).toEqual({ listenerResult: false, response: undefined });
    expect(
      dispatchExternal(
        { type: DEV_BUILD_PRESENCE_REQUEST_MESSAGE },
        { id: CHROMIUM_LOCAL_PROD_EXTENSION_ID },
      ),
    ).toEqual({ listenerResult: false, response: { ok: true } });
    expect(
      dispatchExternal(
        { type: DEV_BUILD_PRESENCE_REQUEST_MESSAGE },
        { id: CHROMIUM_STORE_PROD_EXTENSION_ID },
      ),
    ).toEqual({ listenerResult: false, response: { ok: true } });
  });

  it("dev accepts forwarded hotkey commands only from known production IDs", async () => {
    const { runtime, dispatchExternal } = createRuntime();
    const onForwardedHotkeyCommand = vi.fn().mockResolvedValue(undefined);
    const coordinator = createDevBuildPresenceCoordinator({
      isDevBuild: true,
      runtime,
      onDevPresent: vi.fn(),
      onForwardedHotkeyCommand,
    });
    coordinator.registerExternalListener();

    expect(
      dispatchExternal(
        { type: DEV_BUILD_HOTKEY_COMMAND_MESSAGE, command: "play-pause" },
        { id: "unknown-prod-build" },
      ),
    ).toEqual({ listenerResult: false, response: undefined });
    expect(onForwardedHotkeyCommand).not.toHaveBeenCalled();

    const result = dispatchExternal(
      { type: DEV_BUILD_HOTKEY_COMMAND_MESSAGE, command: "play-pause" },
      { id: CHROMIUM_LOCAL_PROD_EXTENSION_ID },
    );

    expect(result).toEqual({ listenerResult: true, response: undefined });
    await Promise.resolve();
    expect(result.response).toEqual({ ok: true });
    expect(onForwardedHotkeyCommand).toHaveBeenCalledWith("play-pause");
  });
});

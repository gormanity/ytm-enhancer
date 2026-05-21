import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDevBuildPresenceCoordinator } from "@/background/dev-build-presence";
import {
  CHROMIUM_LOCAL_DEV_EXTENSION_ID,
  CHROMIUM_LOCAL_PROD_EXTENSION_ID,
  DEV_BUILD_PRESENCE_MESSAGE,
  DEV_BUILD_PRESENCE_REQUEST_MESSAGE,
} from "@/runtime-messages";

type ExternalListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

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
    ): unknown {
      let response: unknown;
      externalListener?.(message, sender, (value) => {
        response = value;
      });
      return response;
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

    vi.advanceTimersByTime(100);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
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
    ).toBeUndefined();
    expect(onDevPresent).not.toHaveBeenCalled();

    expect(
      dispatchExternal(
        { type: DEV_BUILD_PRESENCE_MESSAGE },
        { id: CHROMIUM_LOCAL_DEV_EXTENSION_ID },
      ),
    ).toEqual({ ok: true });
    expect(onDevPresent).toHaveBeenCalledOnce();
  });

  it("prod probes dev presence before reporting status", async () => {
    const { runtime } = createRuntime();
    runtime.sendMessage.mockImplementation(
      (
        _extensionId: string,
        _message: unknown,
        callback?: (response?: unknown) => void,
      ) => {
        callback?.({ ok: true });
      },
    );
    const onDevPresent = vi.fn();
    const coordinator = createDevBuildPresenceCoordinator({
      isDevBuild: false,
      runtime,
      onDevPresent,
    });

    await coordinator.probeDevPresence();

    expect(runtime.sendMessage).toHaveBeenCalledWith(
      CHROMIUM_LOCAL_DEV_EXTENSION_ID,
      { type: DEV_BUILD_PRESENCE_REQUEST_MESSAGE },
      expect.any(Function),
    );
    expect(onDevPresent).toHaveBeenCalledOnce();
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
    ).toBeUndefined();
    expect(
      dispatchExternal(
        { type: DEV_BUILD_PRESENCE_REQUEST_MESSAGE },
        { id: CHROMIUM_LOCAL_PROD_EXTENSION_ID },
      ),
    ).toEqual({ ok: true });
  });
});

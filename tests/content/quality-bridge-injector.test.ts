import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QualityBridgeInjector } from "@/content/quality-bridge-injector";

describe("QualityBridgeInjector", () => {
  let injector: QualityBridgeInjector;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true });
      },
    );
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
      },
    });
    injector = new QualityBridgeInjector();
  });

  afterEach(() => {
    injector.destroy();
    vi.restoreAllMocks();
  });

  it("should send inject-quality-bridge message to background", async () => {
    await injector.inject();

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "inject-quality-bridge" },
      expect.any(Function),
    );
  });

  it("should resolve when background responds with ok", async () => {
    await expect(injector.inject()).resolves.toBeUndefined();
  });

  it("should reject when background responds with error", async () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: false, error: "Script not found" });
      },
    );

    await expect(injector.inject()).rejects.toThrow("Script not found");
  });

  it("should register a message event listener", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    await injector.inject();

    expect(addSpy).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("should not inject twice", async () => {
    await injector.inject();
    await injector.inject();

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("should send get-quality command via postMessage", async () => {
    const postSpy = vi.spyOn(window, "postMessage");
    await injector.inject();
    injector.getQuality();

    expect(postSpy).toHaveBeenCalledWith(
      { type: "ytm-enhancer:quality-bridge-cmd", command: "get-quality" },
      "*",
    );
  });

  it("should resolve getQuality with current quality value", async () => {
    await injector.inject();

    const qualityPromise = injector.getQuality();

    const event = new MessageEvent("message", {
      data: {
        type: "ytm-enhancer:quality-data",
        current: "3",
      },
    });
    window.dispatchEvent(event);

    const result = await qualityPromise;
    expect(result).toEqual({ current: "3" });
  });

  it("should handle null current quality gracefully", async () => {
    await injector.inject();

    const qualityPromise = injector.getQuality();

    const event = new MessageEvent("message", {
      data: {
        type: "ytm-enhancer:quality-data",
        current: null,
      },
    });
    window.dispatchEvent(event);

    const result = await qualityPromise;
    expect(result).toEqual({ current: null });
  });

  it("should handle missing current field gracefully", async () => {
    await injector.inject();

    const qualityPromise = injector.getQuality();

    const event = new MessageEvent("message", {
      data: {
        type: "ytm-enhancer:quality-data",
      },
    });
    window.dispatchEvent(event);

    const result = await qualityPromise;
    expect(result).toEqual({ current: null });
  });

  it("should send set-quality command via postMessage", async () => {
    const postSpy = vi.spyOn(window, "postMessage");
    await injector.inject();
    injector.setQuality("3");

    expect(postSpy).toHaveBeenCalledWith(
      {
        type: "ytm-enhancer:quality-bridge-cmd",
        command: "set-quality",
        value: "3",
      },
      "*",
    );
  });

  it("should ignore messages with wrong type", async () => {
    await injector.inject();

    const qualityPromise = injector.getQuality();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "other-message", current: "1" },
      }),
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "ytm-enhancer:quality-data",
          current: "2",
        },
      }),
    );

    const result = await qualityPromise;
    expect(result.current).toBe("2");
  });

  it("should remove event listener on destroy", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    await injector.inject();

    injector.destroy();

    expect(removeSpy).toHaveBeenCalledWith("message", expect.any(Function));
  });
});

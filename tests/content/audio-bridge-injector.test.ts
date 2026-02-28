import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AudioBridgeInjector } from "@/content/audio-bridge-injector";

describe("AudioBridgeInjector", () => {
  let injector: AudioBridgeInjector;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
      },
    });
    injector = new AudioBridgeInjector();
  });

  afterEach(() => {
    injector.destroy();
    vi.restoreAllMocks();
  });

  it("should send inject-audio-bridge message to background", () => {
    injector.inject(vi.fn());

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "inject-audio-bridge",
    });
  });

  it("should register a message event listener", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    injector.inject(vi.fn());

    expect(addSpy).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("should call the callback with Uint8Array when valid message is received", () => {
    const callback = vi.fn();
    injector.inject(callback);

    const event = new MessageEvent("message", {
      data: {
        type: "ytm-enhancer:frequency-data",
        data: [128, 64, 192],
      },
    });
    window.dispatchEvent(event);

    expect(callback).toHaveBeenCalledTimes(1);
    const arg = callback.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg)).toEqual([128, 64, 192]);
  });

  it("should ignore messages with wrong type", () => {
    const callback = vi.fn();
    injector.inject(callback);

    const event = new MessageEvent("message", {
      data: { type: "other-message", data: [1, 2, 3] },
    });
    window.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it("should ignore messages without data array", () => {
    const callback = vi.fn();
    injector.inject(callback);

    const event = new MessageEvent("message", {
      data: { type: "ytm-enhancer:frequency-data" },
    });
    window.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it("should send start command via postMessage", () => {
    const postSpy = vi.spyOn(window, "postMessage");
    injector.inject(vi.fn());
    injector.start();

    expect(postSpy).toHaveBeenCalledWith(
      { type: "ytm-enhancer:audio-bridge-cmd", command: "start" },
      "*",
    );
  });

  it("should send stop command via postMessage", () => {
    const postSpy = vi.spyOn(window, "postMessage");
    injector.inject(vi.fn());
    injector.stop();

    expect(postSpy).toHaveBeenCalledWith(
      { type: "ytm-enhancer:audio-bridge-cmd", command: "stop" },
      "*",
    );
  });

  it("should send resume command via postMessage", () => {
    const postSpy = vi.spyOn(window, "postMessage");
    injector.inject(vi.fn());
    injector.resume();

    expect(postSpy).toHaveBeenCalledWith(
      { type: "ytm-enhancer:audio-bridge-cmd", command: "resume" },
      "*",
    );
  });

  it("should remove event listener on destroy", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    injector.inject(vi.fn());

    injector.destroy();

    expect(removeSpy).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("should not inject twice", () => {
    injector.inject(vi.fn());
    injector.inject(vi.fn());

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });
});

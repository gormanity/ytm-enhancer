import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MiniPlayerController } from "@/modules/mini-player/controller";
import { SELECTORS } from "@/adapter/selectors";

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => void;

const messageListeners: MessageListener[] = [];

function stubChrome(runtimeOverrides: Record<string, unknown> = {}) {
  messageListeners.length = 0;
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(
        (_msg: unknown, callback?: (response: unknown) => void) => {
          if (callback) callback({ ok: true, data: true });
        },
      ),
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => {
          messageListeners.push(listener);
        }),
        removeListener: vi.fn((listener: MessageListener) => {
          const idx = messageListeners.indexOf(listener);
          if (idx >= 0) messageListeners.splice(idx, 1);
        }),
      },
      ...runtimeOverrides,
    },
  });
}

function sendRuntimeMessage(message: unknown): void {
  for (const listener of messageListeners) {
    listener(message, {}, () => {});
  }
}

function createNativeMiniPlayerButton(): HTMLElement {
  const button = document.createElement("yt-icon-button");
  button.className = "player-minimize-button";
  button.setAttribute("title", "Open mini player");
  document.body.appendChild(button);
  return button;
}

describe("MiniPlayerController", () => {
  let controller: MiniPlayerController;

  beforeEach(() => {
    vi.useFakeTimers();
    stubChrome();
    vi.stubGlobal("documentPictureInPicture", undefined);
  });

  afterEach(() => {
    controller?.destroy();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should query enabled state on init", async () => {
    const sendMessage = vi.fn(
      (_msg: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );
    stubChrome({ sendMessage });

    createNativeMiniPlayerButton();
    controller = new MiniPlayerController();
    await controller.init();

    expect(sendMessage).toHaveBeenCalledWith(
      { type: "get-mini-player-enabled" },
      expect.any(Function),
    );
  });

  it("should hijack native button when enabled and button exists", async () => {
    const nativeButton = createNativeMiniPlayerButton();
    const spy = vi.spyOn(nativeButton, "addEventListener");

    controller = new MiniPlayerController();
    await controller.init();

    expect(spy).toHaveBeenCalledWith("click", expect.any(Function), true);
  });

  it("should not hijack button when disabled", async () => {
    const sendMessage = vi.fn(
      (_msg: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: false });
      },
    );
    stubChrome({ sendMessage });

    const nativeButton = createNativeMiniPlayerButton();
    const spy = vi.spyOn(nativeButton, "addEventListener");

    controller = new MiniPlayerController();
    await controller.init();

    expect(spy).not.toHaveBeenCalled();
  });

  it("should wait for native button with MutationObserver", async () => {
    controller = new MiniPlayerController();
    await controller.init();

    // No native button yet — observer should be waiting
    const nativeButton = createNativeMiniPlayerButton();
    const spy = vi.spyOn(nativeButton, "addEventListener");

    // Trigger a microtask flush for MutationObserver
    await vi.advanceTimersByTimeAsync(0);

    expect(spy).toHaveBeenCalledWith("click", expect.any(Function), true);
  });

  it("should clean up on destroy", async () => {
    const nativeButton = createNativeMiniPlayerButton();

    controller = new MiniPlayerController();
    await controller.init();

    const removeSpy = vi.spyOn(nativeButton, "removeEventListener");
    controller.destroy();

    expect(removeSpy).toHaveBeenCalledWith("click", expect.any(Function), true);
  });

  it("should open video PiP fallback when Document PiP is unavailable", async () => {
    const nativeButton = createNativeMiniPlayerButton();

    const requestPiP = vi.fn().mockResolvedValue({});
    const video = document.createElement("video");
    video.className = "html5-main-video";
    video.requestPictureInPicture = requestPiP;
    document.body.appendChild(video);

    const original = document.querySelector.bind(document);
    vi.spyOn(document, "querySelector").mockImplementation((sel: string) => {
      if (sel === SELECTORS.videoElement) return video;
      if (sel === SELECTORS.nativeMiniPlayerButton) return nativeButton;
      return original(sel);
    });

    controller = new MiniPlayerController();
    await controller.init();

    nativeButton.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(requestPiP).toHaveBeenCalled();
  });

  it("should open Document PiP when API is available", async () => {
    createNativeMiniPlayerButton();

    const pipDoc = document.implementation.createHTMLDocument("PiP");
    const pipWindow = {
      document: pipDoc,
      addEventListener: vi.fn(),
    };
    const requestWindow = vi.fn().mockResolvedValue(pipWindow);
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow,
    });

    controller = new MiniPlayerController();
    await controller.init();

    const nativeButton = document.querySelector(
      SELECTORS.nativeMiniPlayerButton,
    ) as HTMLElement;
    nativeButton.click();

    await vi.advanceTimersByTimeAsync(0);

    expect(requestWindow).toHaveBeenCalledWith({
      width: 320,
      height: 400,
    });
  });

  it("should seek video when PiP seek bar is used", async () => {
    createNativeMiniPlayerButton();

    // Add a video element for seeking
    const video = document.createElement("video");
    video.className = "html5-main-video";
    document.body.appendChild(video);

    const pipDoc = document.implementation.createHTMLDocument("PiP");
    const pipWindow = {
      document: pipDoc,
      addEventListener: vi.fn(),
    };
    const requestWindow = vi.fn().mockResolvedValue(pipWindow);
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow,
    });

    controller = new MiniPlayerController();
    await controller.init();

    const nativeButton = document.querySelector(
      SELECTORS.nativeMiniPlayerButton,
    ) as HTMLElement;
    nativeButton.click();
    await vi.advanceTimersByTimeAsync(0);

    // The PiP window should have a progress bar with seek support
    const bar = pipDoc.querySelector<HTMLElement>(".progress-bar");
    expect(bar).not.toBeNull();

    // Mock getBoundingClientRect
    bar!.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Simulate a click at 50% of the bar — duration is 0 by default so
    // this won't actually seek, but it should not throw
    bar!.dispatchEvent(new MouseEvent("mousedown", { clientX: 100 }));

    // Now set a duration on the video and try again
    Object.defineProperty(video, "duration", { value: 200, writable: true });
    Object.defineProperty(video, "currentTime", { value: 0, writable: true });

    // Trigger a poll to update duration in renderer
    vi.advanceTimersByTime(1000);

    bar!.dispatchEvent(new MouseEvent("mousedown", { clientX: 100 }));

    // 100/200 = 0.5 * 200s = 100s
    expect(video.currentTime).toBe(100);
  });

  it("should poll adapter and update renderer in Document PiP mode", async () => {
    createNativeMiniPlayerButton();

    // Set up player bar elements for adapter
    const titleEl = document.createElement("yt-formatted-string");
    titleEl.className = "title style-scope ytmusic-player-bar";
    titleEl.textContent = "Test Song";
    document.body.appendChild(titleEl);

    const pipDoc = document.implementation.createHTMLDocument("PiP");
    const pipWindow = {
      document: pipDoc,
      addEventListener: vi.fn(),
    };
    const requestWindow = vi.fn().mockResolvedValue(pipWindow);
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow,
    });

    controller = new MiniPlayerController();
    await controller.init();

    const nativeButton = document.querySelector(
      SELECTORS.nativeMiniPlayerButton,
    ) as HTMLElement;
    nativeButton.click();
    await vi.advanceTimersByTimeAsync(0);

    // Renderer should have built the PiP window
    expect(pipDoc.body.innerHTML).not.toBe("");

    // Advance timer to trigger a poll cycle
    titleEl.textContent = "Updated Song";
    vi.advanceTimersByTime(1000);

    expect(pipDoc.body.textContent).toContain("Updated Song");
  });

  it("should stop polling on PiP window pagehide", async () => {
    createNativeMiniPlayerButton();

    const pipDoc = document.implementation.createHTMLDocument("PiP");
    let pagehideHandler: (() => void) | null = null;
    const pipWindow = {
      document: pipDoc,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "pagehide") pagehideHandler = handler;
      }),
    };
    const requestWindow = vi.fn().mockResolvedValue(pipWindow);
    vi.stubGlobal("documentPictureInPicture", {
      requestWindow,
    });

    controller = new MiniPlayerController();
    await controller.init();

    const nativeButton = document.querySelector(
      SELECTORS.nativeMiniPlayerButton,
    ) as HTMLElement;
    nativeButton.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(pagehideHandler).not.toBeNull();

    // Simulate PiP window closing
    pagehideHandler!();

    // Verify that further timer advances don't cause errors
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it("should remove button when disabled via toggle message", async () => {
    const nativeButton = createNativeMiniPlayerButton();
    const addSpy = vi.spyOn(nativeButton, "addEventListener");

    controller = new MiniPlayerController();
    await controller.init();

    expect(addSpy).toHaveBeenCalledWith("click", expect.any(Function), true);

    const removeSpy = vi.spyOn(nativeButton, "removeEventListener");

    sendRuntimeMessage({ type: "set-mini-player-enabled", data: false });

    expect(removeSpy).toHaveBeenCalledWith("click", expect.any(Function), true);
  });

  it("should re-attach button when re-enabled via toggle message", async () => {
    const sendMessage = vi.fn(
      (_msg: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: false });
      },
    );
    stubChrome({ sendMessage });

    const nativeButton = createNativeMiniPlayerButton();

    controller = new MiniPlayerController();
    await controller.init();

    // Initially disabled — button not attached
    const spy = vi.spyOn(nativeButton, "addEventListener");
    expect(spy).not.toHaveBeenCalled();

    // Send enable message
    sendRuntimeMessage({ type: "set-mini-player-enabled", data: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(spy).toHaveBeenCalledWith("click", expect.any(Function), true);
  });

  it("should not double-attach when already enabled", async () => {
    const nativeButton = createNativeMiniPlayerButton();

    controller = new MiniPlayerController();
    await controller.init();

    const spy = vi.spyOn(nativeButton, "addEventListener");

    // Send enable again — should be a no-op since already enabled
    sendRuntimeMessage({ type: "set-mini-player-enabled", data: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(spy).not.toHaveBeenCalled();
  });

  it("should remove message listener on destroy", async () => {
    createNativeMiniPlayerButton();

    controller = new MiniPlayerController();
    await controller.init();

    controller.destroy();

    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });
});

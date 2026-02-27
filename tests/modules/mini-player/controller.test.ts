import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MiniPlayerController } from "@/modules/mini-player/controller";
import { SELECTORS } from "@/adapter/selectors";

function stubChrome(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(
        (_msg: unknown, callback?: (response: unknown) => void) => {
          if (callback) callback({ ok: true, data: true });
        },
      ),
    },
    ...overrides,
  });
}

function createPlayerBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "right-controls-buttons style-scope ytmusic-player-bar";
  document.body.appendChild(bar);
  return bar;
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
    vi.useRealTimers();
  });

  it("should query enabled state on init", async () => {
    const sendMessage = vi.fn(
      (_msg: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );
    stubChrome({
      runtime: { sendMessage },
    });

    createPlayerBar();
    controller = new MiniPlayerController();
    await controller.init();

    expect(sendMessage).toHaveBeenCalledWith(
      { type: "get-mini-player-enabled" },
      expect.any(Function),
    );
  });

  it("should inject PiP button when enabled and player bar exists", async () => {
    createPlayerBar();
    controller = new MiniPlayerController();
    await controller.init();

    const button = document.querySelector(".ytm-enhancer-pip-button");
    expect(button).not.toBeNull();
  });

  it("should not inject PiP button when disabled", async () => {
    const sendMessage = vi.fn(
      (_msg: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: false });
      },
    );
    stubChrome({ runtime: { sendMessage } });

    createPlayerBar();
    controller = new MiniPlayerController();
    await controller.init();

    const button = document.querySelector(".ytm-enhancer-pip-button");
    expect(button).toBeNull();
  });

  it("should wait for player bar with MutationObserver", async () => {
    controller = new MiniPlayerController();
    await controller.init();

    // No player bar yet — no button
    expect(document.querySelector(".ytm-enhancer-pip-button")).toBeNull();

    // Now add the player bar
    createPlayerBar();

    // Trigger a microtask flush for MutationObserver
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector(".ytm-enhancer-pip-button")).not.toBeNull();
  });

  it("should remove button on destroy", async () => {
    createPlayerBar();
    controller = new MiniPlayerController();
    await controller.init();

    expect(document.querySelector(".ytm-enhancer-pip-button")).not.toBeNull();

    controller.destroy();

    expect(document.querySelector(".ytm-enhancer-pip-button")).toBeNull();
  });

  it("should open video PiP fallback when Document PiP is unavailable", async () => {
    createPlayerBar();

    const requestPiP = vi.fn().mockResolvedValue({});
    const video = document.createElement("video");
    video.className = "html5-main-video";
    video.requestPictureInPicture = requestPiP;
    document.body.appendChild(video);

    const original = document.querySelector.bind(document);
    vi.spyOn(document, "querySelector").mockImplementation((sel: string) => {
      if (sel === SELECTORS.videoElement) return video;
      return original(sel);
    });

    controller = new MiniPlayerController();
    await controller.init();

    const button = document.querySelector<HTMLButtonElement>(
      ".ytm-enhancer-pip-button",
    )!;
    button.click();

    await vi.advanceTimersByTimeAsync(0);

    expect(requestPiP).toHaveBeenCalled();
  });

  it("should open Document PiP when API is available", async () => {
    createPlayerBar();

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

    const button = document.querySelector<HTMLButtonElement>(
      ".ytm-enhancer-pip-button",
    )!;
    button.click();

    await vi.advanceTimersByTimeAsync(0);

    expect(requestWindow).toHaveBeenCalledWith({
      width: 320,
      height: 400,
    });
  });

  it("should poll adapter and update renderer in Document PiP mode", async () => {
    createPlayerBar();

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

    const button = document.querySelector<HTMLButtonElement>(
      ".ytm-enhancer-pip-button",
    )!;
    button.click();
    await vi.advanceTimersByTimeAsync(0);

    // Renderer should have built the PiP window
    expect(pipDoc.body.innerHTML).not.toBe("");

    // Advance timer to trigger a poll cycle
    titleEl.textContent = "Updated Song";
    vi.advanceTimersByTime(1000);

    expect(pipDoc.body.textContent).toContain("Updated Song");
  });

  it("should stop polling on PiP window pagehide", async () => {
    createPlayerBar();

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

    const button = document.querySelector<HTMLButtonElement>(
      ".ytm-enhancer-pip-button",
    )!;
    button.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(pagehideHandler).not.toBeNull();

    // Simulate PiP window closing
    pagehideHandler!();

    // Verify that further timer advances don't cause errors
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});

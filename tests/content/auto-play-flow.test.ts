import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoPlayController } from "@/content/auto-play";
import { createAutoPlayPopupView } from "@/modules/auto-play/popup";
import { YTMAdapter } from "@/adapter";

vi.mock("@/adapter", () => {
  const MockYTMAdapter = vi.fn();
  MockYTMAdapter.prototype.getPlaybackState = vi.fn().mockReturnValue({
    title: "Song",
    artist: "Artist",
    isPlaying: false,
  });
  MockYTMAdapter.prototype.executeAction = vi.fn();
  MockYTMAdapter.prototype.clickQuickPicksPlayAll = vi
    .fn()
    .mockReturnValue(false);
  return { YTMAdapter: MockYTMAdapter };
});

type RuntimeMessage = {
  type: string;
  enabled?: boolean;
};

describe("auto-play integration flows", () => {
  let autoPlayEnabled = false;
  let runtimeListeners: Array<(message: RuntimeMessage) => void> = [];
  let sendMessageMock: ReturnType<typeof vi.fn>;
  const controllers: AutoPlayController[] = [];

  beforeEach(() => {
    document.body.innerHTML = "";
    runtimeListeners = [];
    autoPlayEnabled = false;

    sendMessageMock = vi.fn(
      (
        message: RuntimeMessage,
        callback?: (response: { ok: boolean; data?: boolean }) => void,
      ) => {
        if (message.type === "get-auto-play-enabled") {
          callback?.({ ok: true, data: autoPlayEnabled });
          return;
        }
        if (message.type === "set-auto-play-enabled") {
          autoPlayEnabled = message.enabled === true;
          callback?.({ ok: true, data: autoPlayEnabled });
          for (const listener of runtimeListeners) {
            listener({
              type: "set-auto-play-enabled",
              enabled: autoPlayEnabled,
            });
          }
          return;
        }
        callback?.({ ok: false });
      },
    );

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener: vi.fn((listener: (message: RuntimeMessage) => void) => {
            runtimeListeners.push(listener);
          }),
          removeListener: vi.fn(
            (listener: (message: RuntimeMessage) => void) => {
              runtimeListeners = runtimeListeners.filter((l) => l !== listener);
            },
          ),
        },
      },
    });
  });

  afterEach(() => {
    for (const controller of controllers) {
      controller.destroy();
    }
    controllers.length = 0;
    vi.restoreAllMocks();
  });

  function createReadyVideo(): HTMLVideoElement {
    const video = document.createElement("video");
    video.className = "html5-main-video";
    video.play = vi.fn().mockResolvedValue(undefined);
    video.pause = vi.fn();
    Object.defineProperty(video, "readyState", {
      value: 3,
      writable: true,
      configurable: true,
    });
    document.body.appendChild(video);
    return video;
  }

  function createController(): AutoPlayController {
    const controller = new AutoPlayController();
    controllers.push(controller);
    return controller;
  }

  it("does not pause a currently playing tab when injected late", () => {
    autoPlayEnabled = false;
    vi.spyOn(performance, "now").mockReturnValue(60_000);

    const video = createReadyVideo();
    Object.defineProperty(video, "paused", {
      value: false,
      configurable: true,
    });

    const controller = createController();
    controller.init();
    video.dispatchEvent(new Event("play"));

    expect(video.pause).not.toHaveBeenCalled();
  });

  it("suppresses initial autoplay in a freshly loaded tab when disabled", () => {
    autoPlayEnabled = false;
    vi.spyOn(performance, "now").mockReturnValue(500);

    const video = createReadyVideo();

    const controller = createController();
    controller.init();
    video.dispatchEvent(new Event("play"));

    expect(video.pause).toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });

  it("honors toggling off in popup before immediate reload", () => {
    autoPlayEnabled = true;

    const popupContainer = document.createElement("div");
    createAutoPlayPopupView().render(popupContainer);

    const toggle = popupContainer.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.checked).toBe(true);

    toggle!.checked = false;
    toggle!.dispatchEvent(new Event("change"));
    expect(autoPlayEnabled).toBe(false);

    vi.spyOn(performance, "now").mockReturnValue(800);
    const reloadedVideo = createReadyVideo();

    const controller = createController();
    const adapterInstance =
      vi.mocked(YTMAdapter).mock.instances[
        vi.mocked(YTMAdapter).mock.instances.length - 1
      ];
    expect(adapterInstance).toBeDefined();

    vi.spyOn(adapterInstance!, "getPlaybackState").mockReturnValue({
      title: "Song",
      artist: "Artist",
      album: null,
      year: null,
      artworkUrl: null,
      isPlaying: false,
      progress: 0,
      duration: 180,
    });
    vi.spyOn(adapterInstance!, "clickQuickPicksPlayAll").mockReturnValue(false);

    controller.init();
    reloadedVideo.dispatchEvent(new Event("play"));

    expect(reloadedVideo.pause).toHaveBeenCalled();
    expect(reloadedVideo.play).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoPlayController } from "@/content/auto-play";
import { createAutoPlayPopupView } from "@/modules/auto-play/popup";
import { YTMAdapter } from "@/adapter";
import { createTestModuleContext } from "../helpers/module-context";

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
  MockYTMAdapter.prototype.clickFirstPlayButtonWhenPlayerBarClosed = vi
    .fn()
    .mockReturnValue(false);
  return { YTMAdapter: MockYTMAdapter };
});

type RuntimeMessage = {
  type: string;
  mode?: "default" | "off" | "on";
  enabled?: boolean;
};

describe("auto-play integration flows", () => {
  let autoPlayMode: "default" | "off" | "on" = "default";
  let runtimeListeners: Array<(message: RuntimeMessage) => void> = [];
  let sendMessageMock: ReturnType<typeof vi.fn>;
  const controllers: AutoPlayController[] = [];

  beforeEach(() => {
    document.body.innerHTML = "";
    delete document.documentElement.dataset.ytmEnhancerAutoPlayInitialized;
    runtimeListeners = [];
    autoPlayMode = "default";

    sendMessageMock = vi.fn(
      (
        message: RuntimeMessage,
        callback?: (response: {
          ok: boolean;
          data?: boolean | "default" | "off" | "on";
        }) => void,
      ) => {
        if (message.type === "get-auto-play-mode") {
          callback?.({ ok: true, data: autoPlayMode });
          return;
        }
        if (message.type === "set-auto-play-mode") {
          autoPlayMode = message.mode ?? "default";
          callback?.({ ok: true, data: autoPlayMode });
          for (const listener of runtimeListeners) {
            listener({
              type: "set-auto-play-mode",
              mode: autoPlayMode,
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
    autoPlayMode = "off";
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

  it("does not trigger auto-play when injected late into an existing tab", () => {
    autoPlayMode = "on";
    vi.spyOn(performance, "now").mockReturnValue(60_000);

    const video = createReadyVideo();
    const controller = createController();
    controller.init();

    expect(video.play).not.toHaveBeenCalled();
  });

  it("does not trigger auto-play when reinjected into an initialized page", () => {
    autoPlayMode = "on";
    vi.spyOn(performance, "now").mockReturnValue(500);
    document.documentElement.dataset.ytmEnhancerAutoPlayInitialized = "true";

    const video = createReadyVideo();
    const controller = createController();
    controller.init();

    expect(video.play).not.toHaveBeenCalled();
  });

  it("does not suppress initial autoplay in a freshly loaded tab by default", () => {
    autoPlayMode = "default";
    vi.spyOn(performance, "now").mockReturnValue(500);

    const video = createReadyVideo();

    const controller = createController();
    controller.init();
    video.dispatchEvent(new Event("play"));

    expect(video.pause).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });

  it("suppresses initial autoplay in a freshly loaded tab when off", () => {
    autoPlayMode = "off";
    vi.spyOn(performance, "now").mockReturnValue(500);

    const video = createReadyVideo();

    const controller = createController();
    controller.init();
    video.dispatchEvent(new Event("play"));

    expect(video.pause).toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });

  it("honors toggling off in popup before immediate reload", async () => {
    autoPlayMode = "on";

    const popupContainer = document.createElement("div");
    createAutoPlayPopupView(createTestModuleContext()).render(popupContainer);

    const select = popupContainer.querySelector<HTMLSelectElement>("select");
    expect(select).not.toBeNull();
    await vi.waitFor(() => {
      expect(select?.value).toBe("on");
    });

    select!.value = "off";
    select!.dispatchEvent(new Event("change"));
    expect(autoPlayMode).toBe("off");

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
    vi.spyOn(
      adapterInstance!,
      "clickFirstPlayButtonWhenPlayerBarClosed",
    ).mockReturnValue(false);

    controller.init();
    reloadedVideo.dispatchEvent(new Event("play"));

    expect(reloadedVideo.pause).toHaveBeenCalled();
    expect(reloadedVideo.play).not.toHaveBeenCalled();
  });
});

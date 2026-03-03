import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoPlayController } from "@/content/auto-play";
import { YTMAdapter } from "@/adapter";

vi.mock("@/adapter", () => {
  const MockYTMAdapter = vi.fn();
  MockYTMAdapter.prototype.getPlaybackState = vi.fn().mockReturnValue({
    title: null,
    artist: null,
    isPlaying: false,
  });
  MockYTMAdapter.prototype.executeAction = vi.fn();
  MockYTMAdapter.prototype.clickQuickPicksPlayAll = vi
    .fn()
    .mockReturnValue(false);
  return { YTMAdapter: MockYTMAdapter };
});

/**
 * Create a video element and optionally fire canplay to signal
 * the media is ready. By default the video is NOT ready; call
 * makeReady(video) to fire canplay.
 */
function createVideoElement(): HTMLVideoElement {
  const video = document.createElement("video");
  video.className = "html5-main-video";
  video.play = vi.fn().mockResolvedValue(undefined);
  document.body.appendChild(video);
  return video;
}

function makeReady(video: HTMLVideoElement): void {
  video.dispatchEvent(new Event("canplay"));
}

/** Create a video element that is immediately ready. */
function createReadyVideo(): HTMLVideoElement {
  const video = createVideoElement();
  // Set readyState so sync check passes
  Object.defineProperty(video, "readyState", { value: 3, writable: true });
  return video;
}

describe("AutoPlayController", () => {
  let controller: AutoPlayController;
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let addListenerMock: ReturnType<typeof vi.fn>;
  let removeListenerMock: ReturnType<typeof vi.fn>;
  let adapterInstance: {
    getPlaybackState: ReturnType<typeof vi.fn>;
    executeAction: ReturnType<typeof vi.fn>;
    clickQuickPicksPlayAll: ReturnType<typeof vi.fn>;
  };

  function enableAutoPlay(): void {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";

    sendMessageMock = vi.fn();
    addListenerMock = vi.fn();
    removeListenerMock = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    });

    vi.clearAllMocks();
    controller = new AutoPlayController();
    adapterInstance = vi.mocked(YTMAdapter).mock
      .instances[0] as unknown as typeof adapterInstance;

    adapterInstance.getPlaybackState.mockReturnValue({
      title: null,
      artist: null,
      isPlaying: false,
    });
    adapterInstance.clickQuickPicksPlayAll.mockReturnValue(false);
  });

  afterEach(() => {
    controller.destroy();
    vi.useRealTimers();
  });

  it("should not trigger play when disabled", () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: false });
      },
    );

    controller.init();

    expect(adapterInstance.executeAction).not.toHaveBeenCalled();
  });

  it("should not trigger play when enabled but already playing", () => {
    enableAutoPlay();

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Some Song",
      isPlaying: true,
    });

    const video = createReadyVideo();
    controller.init();

    expect(video.play).not.toHaveBeenCalled();
    expect(adapterInstance.executeAction).not.toHaveBeenCalled();
  });

  it("should call video.play() when video is ready, not playing, and track is loaded", () => {
    enableAutoPlay();

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Some Song",
      isPlaying: false,
    });

    const video = createReadyVideo();
    controller.init();

    expect(video.play).toHaveBeenCalled();
  });

  it("should wait for canplay event when video exists but is not ready", () => {
    enableAutoPlay();

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Some Song",
      isPlaying: false,
    });

    // Video exists but readyState is 0 (not ready)
    const video = createVideoElement();
    controller.init();

    // Should not have played yet
    expect(video.play).not.toHaveBeenCalled();

    // Fire canplay -- now it should play
    makeReady(video);

    expect(video.play).toHaveBeenCalled();
  });

  it("should not use executeAction to play (avoids playerApi race)", () => {
    enableAutoPlay();

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Some Song",
      isPlaying: false,
    });

    createReadyVideo();
    controller.init();

    expect(adapterInstance.executeAction).not.toHaveBeenCalled();
  });

  it("should click Quick Picks when not playing and no track loaded", () => {
    enableAutoPlay();

    adapterInstance.getPlaybackState.mockReturnValue({
      title: null,
      isPlaying: false,
    });

    adapterInstance.clickQuickPicksPlayAll.mockReturnValue(true);

    createReadyVideo();
    controller.init();

    expect(adapterInstance.clickQuickPicksPlayAll).toHaveBeenCalled();
  });

  it("should fall back to video.play() when Quick Picks not found", () => {
    enableAutoPlay();

    adapterInstance.getPlaybackState.mockReturnValue({
      title: null,
      isPlaying: false,
    });

    adapterInstance.clickQuickPicksPlayAll.mockReturnValue(false);

    const video = createReadyVideo();
    controller.init();

    expect(adapterInstance.clickQuickPicksPlayAll).toHaveBeenCalled();
    expect(video.play).toHaveBeenCalled();
  });

  it("should wait for video element to appear then for canplay", async () => {
    enableAutoPlay();

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Song",
      isPlaying: false,
    });

    // No video element yet
    controller.init();

    await Promise.resolve();
    expect(adapterInstance.executeAction).not.toHaveBeenCalled();

    // Video appears but is not ready
    const video = createVideoElement();

    await vi.waitFor(() => {
      // Observer should have spotted the video and registered canplay
      expect(video.play).not.toHaveBeenCalled();
    });

    // Media becomes ready
    makeReady(video);

    expect(video.play).toHaveBeenCalled();
  });

  it("should stop observing after timeout", async () => {
    enableAutoPlay();

    controller.init();

    // Advance past the timeout
    vi.advanceTimersByTime(11_000);

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Song",
      isPlaying: false,
    });

    const video = createReadyVideo();

    await Promise.resolve();

    expect(video.play).not.toHaveBeenCalled();
    expect(adapterInstance.executeAction).not.toHaveBeenCalled();
  });

  it("should listen for set-auto-play-enabled messages", () => {
    controller.init();

    expect(addListenerMock).toHaveBeenCalled();
  });

  it("should clean up on destroy", () => {
    controller.init();
    controller.destroy();

    expect(removeListenerMock).toHaveBeenCalled();
  });
});

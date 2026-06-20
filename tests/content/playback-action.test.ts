import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageResponse } from "@/core/messaging";

type RuntimeListener = (
  message: { type: string; action?: string; time?: number },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void,
) => boolean;

const executeActionMock = vi.fn();
const seekToMock = vi.fn();

vi.mock("@/adapter", () => ({
  YTMAdapter: vi.fn().mockImplementation(function MockYTMAdapter() {
    return {
      executeAction: executeActionMock,
      getPlaybackSpeed: vi.fn().mockReturnValue("1"),
      getPlaybackState: vi.fn().mockReturnValue({
        title: "Track",
        artist: "Artist",
        album: null,
        year: null,
        artworkUrl: null,
        nextTrack: null,
        isPlaying: true,
        progress: 0,
        duration: 180,
      }),
      getVolume: vi.fn().mockReturnValue(1),
      seekTo: seekToMock,
      setPlaybackSpeed: vi.fn(),
      setVolume: vi.fn(),
    };
  }),
}));

vi.mock("@/content/audio-bridge-injector", () => ({
  AudioBridgeInjector: vi
    .fn()
    .mockImplementation(function MockAudioBridgeInjector() {
      return {
        onFrame: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn(),
        destroy: vi.fn(),
      };
    }),
}));

vi.mock("@/content/quality-bridge-injector", () => ({
  QualityBridgeInjector: vi
    .fn()
    .mockImplementation(function MockQualityBridgeInjector() {
      return {
        getQuality: vi.fn().mockResolvedValue({ current: "auto", options: [] }),
        destroy: vi.fn(),
        inject: vi.fn().mockResolvedValue(undefined),
        setQuality: vi.fn(),
      };
    }),
}));

vi.mock("@/content/auto-play", () => ({
  AutoPlayController: vi
    .fn()
    .mockImplementation(function MockAutoPlayController() {
      return {
        destroy: vi.fn(),
        init: vi.fn(),
      };
    }),
}));

vi.mock("@/content/dislike-observer", () => ({
  DislikeObserver: vi.fn().mockImplementation(function MockDislikeObserver() {
    return {
      reobserve: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }),
}));

vi.mock("@/content/track-observer", () => ({
  TrackObserver: vi.fn().mockImplementation(function MockTrackObserver() {
    return {
      start: vi.fn(),
      stop: vi.fn(),
    };
  }),
}));

vi.mock("@/content/dev-build-coordinator", () => ({
  createDevBuildRuntimeCoordinator: vi.fn(
    (options: { onResume: () => void; onSuspend: () => void }) => ({
      start: () => {
        options.onResume();
        return options.onSuspend;
      },
    }),
  ),
}));

vi.mock("@/modules/audio-visualizer/overlay-manager", () => ({
  VisualizerOverlayManager: vi
    .fn()
    .mockImplementation(function MockVisualizerOverlayManager() {
      return {
        attachToPlayerBar: vi.fn(),
        attachToSongArt: vi.fn(),
        destroyAll: vi.fn(),
        hasPlayerBarAttachment: vi.fn().mockReturnValue(true),
        hasSongArtAttachment: vi.fn().mockReturnValue(true),
        setColor: vi.fn(),
        setStyle: vi.fn(),
        setStyleTunings: vi.fn(),
        setTarget: vi.fn(),
        startAll: vi.fn(),
        stopAll: vi.fn(),
        updateFrequencyData: vi.fn(),
      };
    }),
}));

vi.mock("@/modules/mini-player/controller", () => ({
  MiniPlayerController: vi
    .fn()
    .mockImplementation(function MockMiniPlayerController() {
      return {
        destroy: vi.fn(),
        init: vi.fn().mockResolvedValue(undefined),
      };
    }),
}));

describe("content playback action handler", () => {
  let listener: RuntimeListener;
  let runtimeListeners: RuntimeListener[];

  beforeEach(async () => {
    vi.resetModules();
    executeActionMock.mockClear();
    seekToMock.mockClear();
    runtimeListeners = [];

    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: {
          addListener: vi.fn((registered: RuntimeListener) => {
            runtimeListeners.push(registered);
            listener = registered;
          }),
          removeListener: vi.fn((registered: RuntimeListener) => {
            runtimeListeners = runtimeListeners.filter(
              (candidate) => candidate !== registered,
            );
          }),
        },
        sendMessage: vi.fn(
          (
            _message: unknown,
            callback?: (response: MessageResponse) => void,
          ) => {
            callback?.({ ok: false, error: "Not enabled" });
          },
        ),
      },
    });

    await import("@/content/index");
  });

  afterEach(() => {
    (
      globalThis as typeof globalThis & {
        __ytmEnhancerContentRuntime?: { stop: () => void };
      }
    ).__ytmEnhancerContentRuntime?.stop();
    vi.unstubAllGlobals();
  });

  function sendPlaybackAction(message: {
    action: string;
    time?: number;
  }): Promise<MessageResponse> {
    return new Promise((resolve) => {
      listener(
        { type: "playback-action", ...message },
        {} as chrome.runtime.MessageSender,
        resolve,
      );
    });
  }

  function broadcastPlaybackAction(message: {
    action: string;
    time?: number;
  }): Promise<MessageResponse[]> {
    return Promise.all(
      runtimeListeners.map(
        (runtimeListener) =>
          new Promise<MessageResponse>((resolve) => {
            runtimeListener(
              { type: "playback-action", ...message },
              {} as chrome.runtime.MessageSender,
              resolve,
            );
          }),
      ),
    );
  }

  it("seeks directly when playback action includes a seek time", async () => {
    const response = await sendPlaybackAction({ action: "seekTo", time: 87.5 });

    expect(response).toEqual({ ok: true });
    expect(seekToMock).toHaveBeenCalledWith(87.5);
    expect(executeActionMock).not.toHaveBeenCalled();
  });

  it("rejects seek actions without a numeric time", async () => {
    const response = await sendPlaybackAction({ action: "seekTo" });

    expect(response).toEqual({ ok: false, error: "Invalid seek time" });
    expect(seekToMock).not.toHaveBeenCalled();
  });

  it("stops the previous content runtime when content is reinjected", async () => {
    expect(runtimeListeners).toHaveLength(1);

    vi.resetModules();
    await import("@/content/index");

    expect(runtimeListeners).toHaveLength(1);

    const responses = await broadcastPlaybackAction({ action: "next" });

    expect(responses).toEqual([{ ok: true }]);
    expect(executeActionMock).toHaveBeenCalledTimes(1);
    expect(executeActionMock).toHaveBeenCalledWith("next");
  });
});

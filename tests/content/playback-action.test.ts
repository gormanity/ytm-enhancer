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
      };
    }),
}));

vi.mock("@/content/quality-bridge-injector", () => ({
  QualityBridgeInjector: vi
    .fn()
    .mockImplementation(function MockQualityBridgeInjector() {
      return {
        getQuality: vi.fn().mockResolvedValue({ current: "auto", options: [] }),
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
        init: vi.fn(),
      };
    }),
}));

vi.mock("@/content/dislike-observer", () => ({
  DislikeObserver: vi.fn().mockImplementation(function MockDislikeObserver() {
    return {
      reobserve: vi.fn(),
      start: vi.fn(),
    };
  }),
}));

vi.mock("@/content/track-observer", () => ({
  TrackObserver: vi.fn().mockImplementation(function MockTrackObserver() {
    return {
      start: vi.fn(),
    };
  }),
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
        init: vi.fn().mockResolvedValue(undefined),
      };
    }),
}));

describe("content playback action handler", () => {
  let listener: RuntimeListener;

  beforeEach(async () => {
    vi.resetModules();
    executeActionMock.mockClear();
    seekToMock.mockClear();

    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: {
          addListener: vi.fn((registered: RuntimeListener) => {
            listener = registered;
          }),
          removeListener: vi.fn(),
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
});

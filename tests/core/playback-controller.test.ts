import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlaybackController,
  createYtmPlaybackDriver,
} from "@/core/playback-controller";
import type { PlaybackState } from "@/core/types";
import type { YtmRuntimeClient } from "@/core/ytm-client";

function createPlaybackState(
  overrides: Partial<PlaybackState> = {},
): PlaybackState {
  return {
    title: "Track A",
    artist: "Artist A",
    album: null,
    year: null,
    artworkUrl: null,
    nextTrack: null,
    isPlaying: false,
    progress: 10,
    duration: 200,
    ...overrides,
  };
}

describe("PlaybackController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should publish initial state and poll while started", async () => {
    const listener = vi.fn();
    const getPlaybackState = vi
      .fn()
      .mockResolvedValueOnce(createPlaybackState({ title: "Initial" }))
      .mockResolvedValueOnce(createPlaybackState({ title: "Polled" }));
    const controller = createPlaybackController(
      {
        getPlaybackState,
        executePlaybackAction: vi.fn(),
        seekTo: vi.fn(),
      },
      { pollIntervalMs: 1000 },
    );

    controller.subscribe(listener);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(listener).toHaveBeenLastCalledWith({
      ok: true,
      data: expect.objectContaining({ title: "Initial" }),
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(listener).toHaveBeenLastCalledWith({
      ok: true,
      data: expect.objectContaining({ title: "Polled" }),
    });

    controller.destroy();
  });

  it("should refresh immediately and once more after playback actions", async () => {
    const listener = vi.fn();
    const getPlaybackState = vi
      .fn()
      .mockResolvedValueOnce(createPlaybackState({ isPlaying: false }))
      .mockResolvedValueOnce(createPlaybackState({ isPlaying: true }))
      .mockResolvedValueOnce(createPlaybackState({ isPlaying: true }));
    let resolveAction: (() => void) | undefined;
    const executePlaybackAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const controller = createPlaybackController(
      {
        getPlaybackState,
        executePlaybackAction,
        seekTo: vi.fn(),
      },
      { delayedRefreshMs: 150 },
    );
    controller.subscribe(listener);

    const promise = controller.executeAction("togglePlay");
    expect(executePlaybackAction).toHaveBeenCalledWith("togglePlay");
    expect(getPlaybackState).not.toHaveBeenCalled();

    resolveAction?.();
    await promise;
    await vi.advanceTimersByTimeAsync(0);

    expect(getPlaybackState).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({
      ok: true,
      data: expect.objectContaining({ isPlaying: false }),
    });

    await vi.advanceTimersByTimeAsync(149);
    expect(getPlaybackState).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(getPlaybackState).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it("should refresh from external state events and clean them up", async () => {
    const listener = vi.fn();
    const getPlaybackState = vi
      .fn()
      .mockResolvedValue(createPlaybackState({ title: "Event Track" }));
    let eventListener: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const controller = createPlaybackController({
      getPlaybackState,
      executePlaybackAction: vi.fn(),
      seekTo: vi.fn(),
      subscribeToStateChanges(listener) {
        eventListener = listener;
        return unsubscribe;
      },
    });

    controller.subscribe(listener);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    listener.mockClear();

    eventListener?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(listener).toHaveBeenCalledWith({
      ok: true,
      data: expect.objectContaining({ title: "Event Track" }),
    });

    controller.destroy();

    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("createYtmPlaybackDriver", () => {
  it("should adapt the YTM runtime client to the playback controller driver", async () => {
    const ytm = {
      getPlaybackState: vi.fn().mockResolvedValue(createPlaybackState()),
      executePlaybackAction: vi.fn().mockResolvedValue(undefined),
      seekTo: vi.fn().mockResolvedValue(undefined),
    } as Partial<YtmRuntimeClient> as YtmRuntimeClient;
    const driver = createYtmPlaybackDriver(ytm);

    await driver.getPlaybackState();
    await driver.executePlaybackAction("next");
    await driver.seekTo(42);

    expect(ytm.getPlaybackState).toHaveBeenCalled();
    expect(ytm.executePlaybackAction).toHaveBeenCalledWith("next");
    expect(ytm.seekTo).toHaveBeenCalledWith(42);
  });
});

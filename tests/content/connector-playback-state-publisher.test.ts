import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorPlaybackStatePublisher } from "@/content/connector-playback-state-publisher";
import type { PlaybackState } from "@/core/types";

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    title: "Song",
    artist: "Artist",
    album: null,
    year: null,
    artworkUrl: null,
    nextTrack: null,
    isPlaying: true,
    progress: 12,
    duration: 180,
    ...overrides,
  };
}

function createVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.className = "html5-main-video";
  document.body.appendChild(video);
  return video;
}

describe("ConnectorPlaybackStatePublisher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("publishes adapter playback state from media events only while enabled", () => {
    const video = createVideo();
    const state = makeState();
    const getPlaybackState = vi.fn(() => state);
    const publish = vi.fn();
    const publisher = new ConnectorPlaybackStatePublisher(
      getPlaybackState,
      publish,
    );

    video.dispatchEvent(new Event("play"));
    expect(publish).not.toHaveBeenCalled();

    publisher.setEnabled(true);
    video.dispatchEvent(new Event("play"));

    expect(publish).toHaveBeenCalledWith(state);

    publisher.setEnabled(false);
    publish.mockClear();
    video.dispatchEvent(new Event("pause"));

    expect(publish).not.toHaveBeenCalled();
  });

  it("throttles timeupdate while still publishing other media events immediately", () => {
    const video = createVideo();
    const getPlaybackState = vi.fn(() => makeState());
    const publish = vi.fn();
    const publisher = new ConnectorPlaybackStatePublisher(
      getPlaybackState,
      publish,
      { timeupdateIntervalMs: 1000 },
    );

    publisher.setEnabled(true);

    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("timeupdate"));
    expect(publish).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(999);
    video.dispatchEvent(new Event("timeupdate"));
    expect(publish).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    video.dispatchEvent(new Event("timeupdate"));
    expect(publish).toHaveBeenCalledTimes(2);

    video.dispatchEvent(new Event("seeked"));
    expect(publish).toHaveBeenCalledTimes(3);
  });
});

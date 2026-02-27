import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TrackObserver } from "@/content/track-observer";
import type { PlaybackState } from "@/core/types";

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    title: "Song Title",
    artist: "Artist Name",
    album: "Album",
    artworkUrl: "https://example.com/art.jpg",
    isPlaying: true,
    progress: 0,
    duration: 200,
    ...overrides,
  };
}

describe("TrackObserver", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let getStateMock: ReturnType<typeof vi.fn<() => PlaybackState>>;
  let observer: TrackObserver;

  beforeEach(() => {
    vi.useFakeTimers();

    sendMessageMock = vi.fn();
    getStateMock = vi.fn<() => PlaybackState>();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
      },
    });

    observer = new TrackObserver(getStateMock);
  });

  afterEach(() => {
    observer.stop();
    vi.useRealTimers();
  });

  it("should send track-changed message when track changes", () => {
    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    vi.advanceTimersByTime(2000);

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "track-changed",
      state,
    });
  });

  it("should not send message when track is the same", () => {
    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    vi.advanceTimersByTime(2000);
    sendMessageMock.mockClear();

    vi.advanceTimersByTime(2000);

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should not send message when not playing", () => {
    getStateMock.mockReturnValue(makeState({ isPlaying: false }));

    observer.start();
    vi.advanceTimersByTime(2000);

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should not send message when title is null", () => {
    getStateMock.mockReturnValue(makeState({ title: null }));

    observer.start();
    vi.advanceTimersByTime(2000);

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should send message when track changes to a new track", () => {
    getStateMock.mockReturnValue(makeState({ title: "First" }));
    observer.start();
    vi.advanceTimersByTime(2000);
    sendMessageMock.mockClear();

    getStateMock.mockReturnValue(makeState({ title: "Second" }));
    vi.advanceTimersByTime(2000);

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "track-changed",
        state: expect.objectContaining({ title: "Second" }),
      }),
    );
  });

  it("should send message when playback resumes after pause", () => {
    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    vi.advanceTimersByTime(2000);
    sendMessageMock.mockClear();

    // Pause playback
    getStateMock.mockReturnValue(makeState({ isPlaying: false }));
    vi.advanceTimersByTime(2000);

    // Resume playback with the same track
    getStateMock.mockReturnValue(state);
    vi.advanceTimersByTime(2000);

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "track-changed",
      state,
    });
  });

  it("should stop polling when stop is called", () => {
    getStateMock.mockReturnValue(makeState());
    observer.start();
    vi.advanceTimersByTime(2000);
    sendMessageMock.mockClear();

    observer.stop();
    getStateMock.mockReturnValue(makeState({ title: "New" }));
    vi.advanceTimersByTime(2000);

    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

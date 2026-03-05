import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TrackObserver } from "@/content/track-observer";
import type { PlaybackState } from "@/core/types";

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    title: "Song Title",
    artist: "Artist Name",
    album: "Album",
    year: 2024,
    artworkUrl: "https://example.com/art.jpg",
    isPlaying: true,
    progress: 0,
    duration: 200,
    ...overrides,
  };
}

/**
 * Flush MutationObserver microtasks, then advance the debounce timer.
 * TrackObserver debounces checkTrack by 150ms after a mutation.
 */
async function flush(): Promise<void> {
  // Let MutationObserver callbacks fire
  await vi.waitFor(() => {}, { timeout: 50 });
  // Advance past the debounce delay
  vi.advanceTimersByTime(200);
}

function createPlayerBar(): HTMLElement {
  const el = document.createElement("ytmusic-player-bar");
  document.body.appendChild(el);
  return el;
}

function createTitleElement(text: string, parent?: HTMLElement): HTMLElement {
  const el = document.createElement("yt-formatted-string");
  el.className = "title style-scope ytmusic-player-bar";
  el.textContent = text;
  (parent ?? document.body).appendChild(el);
  return el;
}

function createArtistElement(text: string, parent?: HTMLElement): HTMLElement {
  const span = document.createElement("span");
  span.className = "subtitle style-scope ytmusic-player-bar";
  const formatted = document.createElement("yt-formatted-string");
  const a = document.createElement("a");
  a.textContent = text;
  formatted.appendChild(a);
  span.appendChild(formatted);
  (parent ?? document.body).appendChild(span);
  return a;
}

function createPlayPauseButton(title: string): HTMLElement {
  const el = document.createElement("button");
  el.id = "play-pause-button";
  el.setAttribute("title", title);
  document.body.appendChild(el);
  return el;
}

function createVideoElement(readyState: number): HTMLVideoElement {
  const video = document.createElement("video");
  video.className = "html5-main-video";
  Object.defineProperty(video, "readyState", {
    value: readyState,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, "ended", {
    value: false,
    writable: true,
    configurable: true,
  });
  document.body.appendChild(video);
  return video;
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
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("should send track-changed when title element text changes", async () => {
    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song Title", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    titleEl.textContent = "New Song";
    await flush();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "track-changed",
      state,
    });
  });

  it("should not send message when track key is the same", async () => {
    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song Title", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    titleEl.textContent = "First Change";
    await flush();
    sendMessageMock.mockClear();

    // Same state returned — mutation fires but dedup prevents message
    titleEl.textContent = "Second Change";
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should not send message when not playing", async () => {
    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song Title", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Play");

    getStateMock.mockReturnValue(makeState({ isPlaying: false }));

    observer.start();
    titleEl.textContent = "Changed";
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should not send message when title is null", async () => {
    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song Title", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    getStateMock.mockReturnValue(makeState({ title: null }));

    observer.start();
    titleEl.textContent = "Changed";
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should send message when track changes to a new track", async () => {
    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("First", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    getStateMock.mockReturnValue(makeState({ title: "First" }));
    observer.start();

    titleEl.textContent = "Trigger";
    await flush();
    sendMessageMock.mockClear();

    getStateMock.mockReturnValue(makeState({ title: "Second" }));
    titleEl.textContent = "Trigger Again";
    await flush();

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "track-changed",
        state: expect.objectContaining({ title: "Second" }),
      }),
    );
  });

  it("should send message when playback resumes after pause", async () => {
    const playerBar = createPlayerBar();
    createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    const playPauseBtn = createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();

    // Initial check fires on start — consume it
    await flush();
    sendMessageMock.mockClear();

    // Simulate pause — play/pause button title changes
    getStateMock.mockReturnValue(makeState({ isPlaying: false }));
    playPauseBtn.setAttribute("title", "Play");
    await flush();

    // Resume — title changes back to "Pause"
    getStateMock.mockReturnValue(state);
    playPauseBtn.setAttribute("title", "Pause");
    await flush();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "track-changed",
      state,
    });
  });

  it("should not send message when playback resumes after buffering pause", async () => {
    const playerBar = createPlayerBar();
    createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    const playPauseBtn = createPlayPauseButton("Pause");
    const video = createVideoElement(4);

    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();

    await flush();
    sendMessageMock.mockClear();

    // Simulate buffering: player reports not playing while media lacks future data.
    Object.defineProperty(video, "readyState", { value: 2, writable: true });
    getStateMock.mockReturnValue(makeState({ isPlaying: false }));
    playPauseBtn.setAttribute("title", "Play");
    await flush();

    // Resume same track after buffering.
    Object.defineProperty(video, "readyState", { value: 4, writable: true });
    getStateMock.mockReturnValue(state);
    playPauseBtn.setAttribute("title", "Pause");
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should call onTrackChange callback when track changes", async () => {
    const onTrackChange = vi.fn();
    const callbackObserver = new TrackObserver(getStateMock, onTrackChange);

    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    callbackObserver.start();
    titleEl.textContent = "Changed";
    await flush();

    expect(onTrackChange).toHaveBeenCalledWith(state);

    callbackObserver.stop();
  });

  it("should not call onTrackChange when track has not changed", async () => {
    const onTrackChange = vi.fn();
    const callbackObserver = new TrackObserver(getStateMock, onTrackChange);

    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    callbackObserver.start();
    titleEl.textContent = "Changed";
    await flush();
    onTrackChange.mockClear();

    titleEl.textContent = "Changed Again";
    await flush();

    expect(onTrackChange).not.toHaveBeenCalled();

    callbackObserver.stop();
  });

  it("should not call onTrackChange when not playing", async () => {
    const onTrackChange = vi.fn();
    const callbackObserver = new TrackObserver(getStateMock, onTrackChange);

    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Play");

    getStateMock.mockReturnValue(makeState({ isPlaying: false }));

    callbackObserver.start();
    titleEl.textContent = "Changed";
    await flush();

    expect(onTrackChange).not.toHaveBeenCalled();

    callbackObserver.stop();
  });

  it("should stop observing when stop is called", async () => {
    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    getStateMock.mockReturnValue(makeState());
    observer.start();
    titleEl.textContent = "Trigger";
    await flush();
    sendMessageMock.mockClear();

    observer.stop();
    getStateMock.mockReturnValue(makeState({ title: "New" }));
    titleEl.textContent = "After Stop";
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should discover elements added after start()", async () => {
    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    await flush();

    // Elements don't exist yet — add them now
    const playerBar = createPlayerBar();
    createTitleElement("Song Title", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");
    await flush();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "track-changed",
      state,
    });
  });

  it("should stop discovery observer on stop()", async () => {
    observer.start();
    observer.stop();

    // Adding elements after stop should not trigger anything
    const playerBar = createPlayerBar();
    createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");
    getStateMock.mockReturnValue(makeState());
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should send track-changed when artist element is replaced", async () => {
    const playerBar = createPlayerBar();
    createTitleElement("Song", playerBar);
    createArtistElement("Artist A", playerBar);
    createPlayPauseButton("Pause");

    getStateMock.mockReturnValue(makeState({ artist: "Artist A" }));
    observer.start();
    await flush();
    sendMessageMock.mockClear();

    // Simulate YTM replacing artist element entirely
    const subtitleSpan = playerBar.querySelector("span.subtitle");
    subtitleSpan!.innerHTML = "";
    const newFormatted = document.createElement("yt-formatted-string");
    const newA = document.createElement("a");
    newA.textContent = "Artist B";
    newFormatted.appendChild(newA);
    subtitleSpan!.appendChild(newFormatted);

    getStateMock.mockReturnValue(makeState({ artist: "Artist B" }));
    await flush();

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "track-changed",
        state: expect.objectContaining({ artist: "Artist B" }),
      }),
    );
  });

  it("should fire initial check when elements are already present", async () => {
    const playerBar = createPlayerBar();
    createTitleElement("Song", playerBar);
    createArtistElement("Artist", playerBar);
    createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    await flush();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "track-changed",
      state,
    });
  });

  it("should debounce rapid mutations into a single check", async () => {
    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    // Consume the initial check
    await flush();
    getStateMock.mockClear();
    sendMessageMock.mockClear();

    getStateMock.mockReturnValue(makeState({ title: "New" }));

    // Rapidly mutate title multiple times
    titleEl.textContent = "A";
    titleEl.textContent = "B";
    titleEl.textContent = "C";
    await flush();

    // Should only call getPlaybackState once (debounced)
    expect(getStateMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("should cancel debounce timer on stop()", async () => {
    const playerBar = createPlayerBar();
    const titleEl = createTitleElement("Song", playerBar);
    createArtistElement("Artist Name", playerBar);
    createPlayPauseButton("Pause");

    getStateMock.mockReturnValue(makeState());
    observer.start();

    titleEl.textContent = "Changed";
    // Let MutationObserver fire but don't advance past debounce
    await vi.waitFor(() => {}, { timeout: 50 });

    observer.stop();
    vi.advanceTimersByTime(200);

    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

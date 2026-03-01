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

/** Flush pending MutationObserver callbacks. */
async function flush(): Promise<void> {
  await vi.waitFor(() => {}, { timeout: 50 });
}

function createTitleElement(text: string): HTMLElement {
  const el = document.createElement("yt-formatted-string");
  el.className = "title style-scope ytmusic-player-bar";
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

function createPlayPauseButton(title: string): HTMLElement {
  const el = document.createElement("button");
  el.id = "play-pause-button";
  el.setAttribute("title", title);
  document.body.appendChild(el);
  return el;
}

describe("TrackObserver", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let getStateMock: ReturnType<typeof vi.fn<() => PlaybackState>>;
  let observer: TrackObserver;

  beforeEach(() => {
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
  });

  it("should send track-changed when title element text changes", async () => {
    const titleEl = createTitleElement("Song Title");
    createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();

    // Trigger a mutation on the title element
    titleEl.textContent = "New Song";
    await flush();

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "track-changed",
      state,
    });
  });

  it("should not send message when track key is the same", async () => {
    const titleEl = createTitleElement("Song Title");
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
    const titleEl = createTitleElement("Song Title");
    createPlayPauseButton("Play");

    getStateMock.mockReturnValue(makeState({ isPlaying: false }));

    observer.start();
    titleEl.textContent = "Changed";
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should not send message when title is null", async () => {
    const titleEl = createTitleElement("Song Title");
    createPlayPauseButton("Pause");

    getStateMock.mockReturnValue(makeState({ title: null }));

    observer.start();
    titleEl.textContent = "Changed";
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should send message when track changes to a new track", async () => {
    const titleEl = createTitleElement("First");
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
    const titleEl = createTitleElement("Song");
    const playPauseBtn = createPlayPauseButton("Pause");

    const state = makeState();
    getStateMock.mockReturnValue(state);

    observer.start();
    titleEl.textContent = "Trigger";
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

  it("should call onTrackChange callback when track changes", async () => {
    const onTrackChange = vi.fn();
    const callbackObserver = new TrackObserver(getStateMock, onTrackChange);

    const titleEl = createTitleElement("Song");
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

    const titleEl = createTitleElement("Song");
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

    const titleEl = createTitleElement("Song");
    createPlayPauseButton("Play");

    getStateMock.mockReturnValue(makeState({ isPlaying: false }));

    callbackObserver.start();
    titleEl.textContent = "Changed";
    await flush();

    expect(onTrackChange).not.toHaveBeenCalled();

    callbackObserver.stop();
  });

  it("should stop observing when stop is called", async () => {
    const titleEl = createTitleElement("Song");
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
    const titleEl = createTitleElement("Song Title");
    createPlayPauseButton("Pause");
    await flush();

    // Now trigger a title change
    titleEl.textContent = "Changed";
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
    const titleEl = createTitleElement("Song");
    createPlayPauseButton("Pause");
    getStateMock.mockReturnValue(makeState());
    await flush();

    titleEl.textContent = "Changed";
    await flush();

    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

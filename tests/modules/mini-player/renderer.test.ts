import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipWindowRenderer } from "@/modules/mini-player/renderer";
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

describe("PipWindowRenderer", () => {
  let renderer: PipWindowRenderer;
  let doc: Document;
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    renderer = new PipWindowRenderer();
    doc = document.implementation.createHTMLDocument("PiP");
    onAction = vi.fn();
  });

  it("should build album art into the document", () => {
    const state = makeState();

    renderer.build(doc, state, onAction);

    const img = doc.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.src).toBe("https://example.com/art.jpg");
  });

  it("should build title and artist text", () => {
    const state = makeState();

    renderer.build(doc, state, onAction);

    expect(doc.body.textContent).toContain("Song Title");
    expect(doc.body.textContent).toContain("Artist Name");
  });

  it("should build playback control buttons", () => {
    const state = makeState();

    renderer.build(doc, state, onAction);

    const buttons = doc.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("should fire onAction with togglePlay when play/pause is clicked", () => {
    renderer.build(doc, makeState(), onAction);

    const playPauseBtn = doc.querySelector<HTMLButtonElement>(
      '[data-action="togglePlay"]',
    );
    expect(playPauseBtn).not.toBeNull();
    playPauseBtn!.click();

    expect(onAction).toHaveBeenCalledWith("togglePlay");
  });

  it("should fire onAction with next when next is clicked", () => {
    renderer.build(doc, makeState(), onAction);

    const nextBtn = doc.querySelector<HTMLButtonElement>(
      '[data-action="next"]',
    );
    nextBtn!.click();

    expect(onAction).toHaveBeenCalledWith("next");
  });

  it("should fire onAction with previous when previous is clicked", () => {
    renderer.build(doc, makeState(), onAction);

    const prevBtn = doc.querySelector<HTMLButtonElement>(
      '[data-action="previous"]',
    );
    prevBtn!.click();

    expect(onAction).toHaveBeenCalledWith("previous");
  });

  it("should update title and artist on state change", () => {
    renderer.build(doc, makeState(), onAction);

    renderer.update(makeState({ title: "New Song", artist: "New Artist" }));

    expect(doc.body.textContent).toContain("New Song");
    expect(doc.body.textContent).toContain("New Artist");
  });

  it("should update album art on state change", () => {
    renderer.build(doc, makeState(), onAction);

    renderer.update(
      makeState({ artworkUrl: "https://example.com/new-art.jpg" }),
    );

    const img = doc.querySelector("img");
    expect(img?.src).toBe("https://example.com/new-art.jpg");
  });

  it("should show pause icon when playing", () => {
    renderer.build(doc, makeState({ isPlaying: true }), onAction);

    const playPauseBtn = doc.querySelector<HTMLButtonElement>(
      '[data-action="togglePlay"]',
    );
    expect(playPauseBtn?.getAttribute("aria-label")).toBe("Pause");
  });

  it("should show play icon when paused", () => {
    renderer.build(doc, makeState({ isPlaying: false }), onAction);

    const playPauseBtn = doc.querySelector<HTMLButtonElement>(
      '[data-action="togglePlay"]',
    );
    expect(playPauseBtn?.getAttribute("aria-label")).toBe("Play");
  });

  it("should update play/pause button on state change", () => {
    renderer.build(doc, makeState({ isPlaying: true }), onAction);

    renderer.update(makeState({ isPlaying: false }));

    const playPauseBtn = doc.querySelector<HTMLButtonElement>(
      '[data-action="togglePlay"]',
    );
    expect(playPauseBtn?.getAttribute("aria-label")).toBe("Play");
  });

  it("should handle null artwork gracefully", () => {
    renderer.build(doc, makeState({ artworkUrl: null }), onAction);

    const img = doc.querySelector("img");
    expect(img?.src).toBe("");
  });
});

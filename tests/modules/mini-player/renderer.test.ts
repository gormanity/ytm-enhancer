import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipWindowRenderer } from "@/modules/mini-player/renderer";
import type { PlaybackAction, PlaybackState } from "@/core/types";

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

describe("PipWindowRenderer", () => {
  let renderer: PipWindowRenderer;
  let doc: Document;
  let onAction: ReturnType<typeof vi.fn<(action: PlaybackAction) => void>>;
  let onSeek: ReturnType<typeof vi.fn<(time: number) => void>>;

  beforeEach(() => {
    renderer = new PipWindowRenderer();
    doc = document.implementation.createHTMLDocument("PiP");
    onAction = vi.fn<(action: PlaybackAction) => void>();
    onSeek = vi.fn<(time: number) => void>();
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

  it("should use correct skip-next SVG path for next button", () => {
    renderer.build(doc, makeState(), onAction);

    const nextBtn = doc.querySelector<HTMLButtonElement>(
      '[data-action="next"]',
    );
    const path = nextBtn?.querySelector("path");
    expect(path?.getAttribute("d")).toBe(
      "M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z",
    );
  });

  it("should use correct skip-previous SVG path for previous button", () => {
    renderer.build(doc, makeState(), onAction);

    const prevBtn = doc.querySelector<HTMLButtonElement>(
      '[data-action="previous"]',
    );
    const path = prevBtn?.querySelector("path");
    expect(path?.getAttribute("d")).toBe("M6 6h2v12H6zm3.5 6l8.5 6V6z");
  });

  it("should render a progress bar showing current progress ratio", () => {
    renderer.build(doc, makeState({ progress: 60, duration: 200 }), onAction);

    const fill = doc.querySelector<HTMLElement>(".progress-fill");
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe("30%");
  });

  it("should render time display text", () => {
    renderer.build(doc, makeState({ progress: 83, duration: 225 }), onAction);

    const timeDisplay = doc.querySelector(".time-display");
    expect(timeDisplay?.textContent).toBe("1:23 / 3:45");
  });

  it("should format time display with hours for long tracks", () => {
    renderer.build(
      doc,
      makeState({ progress: 3750, duration: 4500 }),
      onAction,
    );

    const timeDisplay = doc.querySelector(".time-display");
    expect(timeDisplay?.textContent).toBe("1:02:30 / 1:15:00");
  });

  it("should update progress bar on state change", () => {
    renderer.build(doc, makeState({ progress: 0, duration: 200 }), onAction);

    renderer.update(makeState({ progress: 100, duration: 200 }));

    const fill = doc.querySelector<HTMLElement>(".progress-fill");
    expect(fill?.style.width).toBe("50%");
  });

  it("should update time display on state change", () => {
    renderer.build(doc, makeState({ progress: 0, duration: 200 }), onAction);

    renderer.update(makeState({ progress: 83, duration: 225 }));

    const timeDisplay = doc.querySelector(".time-display");
    expect(timeDisplay?.textContent).toBe("1:23 / 3:45");
  });

  it("should show 0% progress when duration is 0", () => {
    renderer.build(doc, makeState({ progress: 0, duration: 0 }), onAction);

    const fill = doc.querySelector<HTMLElement>(".progress-fill");
    expect(fill?.style.width).toBe("0%");
  });

  it("should set document title via both doc.title and title element on build", () => {
    renderer.build(
      doc,
      makeState({ title: "My Song", artist: "My Artist" }),
      onAction,
    );

    expect(doc.title).toBe("My Song — My Artist");
    const titleEl = doc.querySelector("title");
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe("My Song — My Artist");
  });

  it("should update document title on state change", () => {
    renderer.build(doc, makeState(), onAction);

    renderer.update(makeState({ title: "New Song", artist: "New Artist" }));

    expect(doc.title).toBe("New Song — New Artist");
    const titleEl = doc.querySelector("title");
    expect(titleEl?.textContent).toBe("New Song — New Artist");
  });

  it("should use only title when artist is null", () => {
    renderer.build(doc, makeState({ title: "Solo", artist: null }), onAction);

    expect(doc.title).toBe("Solo");
    const titleEl = doc.querySelector("title");
    expect(titleEl?.textContent).toBe("Solo");
  });

  it("should render album and year below artist", () => {
    renderer.build(doc, makeState({ album: "My Album", year: 2024 }), onAction);

    const albumEl = doc.querySelector(".album");
    expect(albumEl).not.toBeNull();
    expect(albumEl?.textContent).toBe("My Album \u00B7 2024");
  });

  it("should render only album when year is null", () => {
    renderer.build(doc, makeState({ album: "My Album", year: null }), onAction);

    const albumEl = doc.querySelector(".album");
    expect(albumEl?.textContent).toBe("My Album");
  });

  it("should render only year when album is null", () => {
    renderer.build(doc, makeState({ album: null, year: 2024 }), onAction);

    const albumEl = doc.querySelector(".album");
    expect(albumEl?.textContent).toBe("2024");
  });

  it("should render empty album line when both are null", () => {
    renderer.build(doc, makeState({ album: null, year: null }), onAction);

    const albumEl = doc.querySelector(".album");
    expect(albumEl?.textContent).toBe("");
  });

  it("should update album and year on state change", () => {
    renderer.build(doc, makeState(), onAction);

    renderer.update(makeState({ album: "New Album", year: 2025 }));

    const albumEl = doc.querySelector(".album");
    expect(albumEl?.textContent).toBe("New Album \u00B7 2025");
  });

  it("should give artwork container flex-shrink so it compresses first", () => {
    renderer.build(doc, makeState(), onAction);

    const container = doc.querySelector<HTMLElement>(".artwork-container");
    expect(container).not.toBeNull();
    const style = doc.querySelector("style")!.textContent!;
    expect(style).toContain("flex-shrink: 1");
    expect(style).toContain("min-height: 0");
  });

  it("should expose artwork container via getArtworkContainer()", () => {
    renderer.build(doc, makeState(), onAction);

    const container = renderer.getArtworkContainer();
    expect(container).not.toBeNull();
    expect(container?.className).toBe("artwork-container");
    expect(container?.querySelector("img.artwork")).not.toBeNull();
  });

  it("should give text, controls, and progress flex-shrink: 0", () => {
    renderer.build(doc, makeState(), onAction);

    const style = doc.querySelector("style")!.textContent!;
    // Controls, title, artist, album, progress, and time should not shrink
    expect(style).toMatch(/\.controls\s*\{[^}]*flex-shrink:\s*0/);
    expect(style).toMatch(/\.title\s*\{[^}]*flex-shrink:\s*0/);
  });

  it("should handle null artwork gracefully", () => {
    renderer.build(doc, makeState({ artworkUrl: null }), onAction);

    const img = doc.querySelector("img");
    expect(img?.src).toBe("");
  });

  it("should render a seek thumb on the progress bar", () => {
    renderer.build(
      doc,
      makeState({ progress: 100, duration: 200 }),
      onAction,
      onSeek,
    );

    const thumb = doc.querySelector<HTMLElement>(".progress-thumb");
    expect(thumb).not.toBeNull();
    expect(thumb?.style.left).toBe("50%");
  });

  it("should update seek thumb position on state change", () => {
    renderer.build(
      doc,
      makeState({ progress: 0, duration: 200 }),
      onAction,
      onSeek,
    );

    renderer.update(makeState({ progress: 150, duration: 200 }));

    const thumb = doc.querySelector<HTMLElement>(".progress-thumb");
    expect(thumb?.style.left).toBe("75%");
  });

  it("should fire onSeek when progress bar is clicked", () => {
    renderer.build(
      doc,
      makeState({ progress: 0, duration: 200 }),
      onAction,
      onSeek,
    );

    const bar = doc.querySelector<HTMLElement>(".progress-bar")!;
    // Mock getBoundingClientRect for the bar
    bar.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 100 }));

    // 100/200 = 0.5, 0.5 * 200s = 100s
    expect(onSeek).toHaveBeenCalledWith(100);
  });

  it("should not fire onSeek when onSeek callback is not provided", () => {
    renderer.build(doc, makeState({ progress: 0, duration: 200 }), onAction);

    const bar = doc.querySelector<HTMLElement>(".progress-bar")!;
    // Should not throw even without onSeek
    expect(() => {
      bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 50 }));
    }).not.toThrow();
  });

  it("should clamp seek position to valid range", () => {
    renderer.build(
      doc,
      makeState({ progress: 0, duration: 200 }),
      onAction,
      onSeek,
    );

    const bar = doc.querySelector<HTMLElement>(".progress-bar")!;
    bar.getBoundingClientRect = () => ({
      left: 100,
      right: 300,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 100,
      y: 0,
      toJSON: () => {},
    });

    // Click before the bar (clientX < left)
    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 50 }));
    expect(onSeek).toHaveBeenCalledWith(0);

    onSeek.mockClear();

    // Click after the bar (clientX > right)
    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 350 }));
    expect(onSeek).toHaveBeenCalledWith(200);
  });
});

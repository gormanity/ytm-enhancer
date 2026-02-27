import { describe, it, expect } from "vitest";
import { SELECTORS } from "@/adapter/selectors";

describe("SELECTORS", () => {
  it("should define a selector for the play/pause button", () => {
    expect(SELECTORS.playPauseButton).toBeDefined();
    expect(typeof SELECTORS.playPauseButton).toBe("string");
  });

  it("should define a selector for the next button", () => {
    expect(SELECTORS.nextButton).toBeDefined();
  });

  it("should define a selector for the previous button", () => {
    expect(SELECTORS.previousButton).toBeDefined();
  });

  it("should define a selector for the track title", () => {
    expect(SELECTORS.trackTitle).toBeDefined();
  });

  it("should define a selector for the artist name", () => {
    expect(SELECTORS.artistName).toBeDefined();
  });

  it("should define a selector for the album art", () => {
    expect(SELECTORS.albumArt).toBeDefined();
  });

  it("should define a selector for the progress bar", () => {
    expect(SELECTORS.progressBar).toBeDefined();
  });

  it("should define a selector for the subtitle", () => {
    expect(SELECTORS.subtitle).toBeDefined();
    expect(typeof SELECTORS.subtitle).toBe("string");
  });

  it("should define a selector for the native mini player button", () => {
    expect(SELECTORS.nativeMiniPlayerButton).toBeDefined();
    expect(typeof SELECTORS.nativeMiniPlayerButton).toBe("string");
  });

  it("should define a selector for the video element", () => {
    expect(SELECTORS.videoElement).toBeDefined();
    expect(typeof SELECTORS.videoElement).toBe("string");
  });
});

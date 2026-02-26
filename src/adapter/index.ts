import { SELECTORS } from "./selectors";
import type { PlaybackAction, PlaybackState } from "@/core/types";

export { SELECTORS } from "./selectors";

/** Adapter layer encapsulating all YouTube Music DOM interaction. */
export class YTMAdapter {
  getPlaybackState(): PlaybackState {
    const titleEl = document.querySelector(SELECTORS.trackTitle);
    const artistEl = document.querySelector(SELECTORS.artistName);
    const artworkEl = document.querySelector(
      SELECTORS.albumArt,
    ) as HTMLImageElement | null;
    const playPauseEl = document.querySelector(SELECTORS.playPauseButton);

    const isPlaying =
      playPauseEl?.getAttribute("title")?.toLowerCase() === "pause";

    return {
      title: titleEl?.textContent?.trim() ?? null,
      artist: artistEl?.textContent?.trim() ?? null,
      album: null,
      artworkUrl: artworkEl?.src ?? null,
      isPlaying,
      progress: 0,
      duration: 0,
    };
  }

  executeAction(action: PlaybackAction): void {
    switch (action) {
      case "togglePlay":
        this.clickButton(SELECTORS.playPauseButton);
        break;

      case "play":
        if (!this.isPlaying()) {
          this.clickButton(SELECTORS.playPauseButton);
        }
        break;

      case "pause":
        if (this.isPlaying()) {
          this.clickButton(SELECTORS.playPauseButton);
        }
        break;

      case "next":
        this.clickButton(SELECTORS.nextButton);
        break;

      case "previous":
        this.clickButton(SELECTORS.previousButton);
        break;
    }
  }

  private isPlaying(): boolean {
    const el = document.querySelector(SELECTORS.playPauseButton);
    return el?.getAttribute("title")?.toLowerCase() === "pause";
  }

  private clickButton(selector: string): void {
    const el = document.querySelector(selector) as HTMLElement | null;
    el?.click();
  }
}

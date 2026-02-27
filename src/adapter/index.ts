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

    const { progress, duration } = this.parseTimeInfo();

    return {
      title: titleEl?.textContent?.trim() ?? null,
      artist: artistEl?.textContent?.trim() ?? null,
      album: null,
      artworkUrl: artworkEl?.src ?? null,
      isPlaying,
      progress,
      duration,
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

  private parseTimeInfo(): { progress: number; duration: number } {
    const el = document.querySelector(SELECTORS.timeInfo);
    const text = el?.textContent?.trim() ?? "";
    const match = text.match(/^(.+?)\s*\/\s*(.+)$/);
    if (!match) return { progress: 0, duration: 0 };

    const progress = this.parseTimestamp(match[1].trim());
    const duration = this.parseTimestamp(match[2].trim());
    return { progress, duration };
  }

  private parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(":").map(Number);
    if (parts.some(isNaN)) return 0;

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
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

import { SELECTORS } from "./selectors";
import type { PlaybackAction, PlaybackState } from "@/core/types";

export { SELECTORS } from "./selectors";

/** Adapter layer encapsulating all YouTube Music DOM interaction. */
export class YTMAdapter {
  /**
   * Infer whether YTM is currently in video-focused playback mode.
   * Song mode typically keeps the video element hidden/minimized.
   */
  isVideoMode(): boolean {
    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    if (!video) return false;

    if (
      video.readyState < 1 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return false;
    }

    return this.isElementVisible(video);
  }

  getPlaybackState(): PlaybackState {
    const titleEl = document.querySelector(SELECTORS.trackTitle);
    const artistEl = document.querySelector(SELECTORS.artistName);
    const artworkEl = document.querySelector(
      SELECTORS.albumArt,
    ) as HTMLImageElement | null;
    const playPauseEl = document.querySelector(SELECTORS.playPauseButton);

    const isPlaying =
      playPauseEl?.getAttribute("title")?.toLowerCase() === "pause";

    const { progress, duration } = this.readVideoTime();

    const { album, year } = this.parseSubtitle();

    return {
      title: titleEl?.textContent?.trim() ?? null,
      artist: artistEl?.textContent?.trim() ?? null,
      album,
      year,
      artworkUrl: this.upscaleArtworkUrl(artworkEl?.src ?? null),
      isPlaying,
      progress,
      duration,
    };
  }

  getPlaybackSpeed(): number {
    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    return video?.playbackRate ?? 1;
  }

  setPlaybackSpeed(rate: number): void {
    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    if (video) video.playbackRate = rate;
  }

  getVolume(): number {
    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    return video?.volume ?? 1;
  }

  setVolume(volume: number): void {
    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    if (video) video.volume = volume;
  }

  isCurrentTrackDisliked(): boolean {
    const btn = document.querySelector(SELECTORS.dislikeButton);
    return btn?.getAttribute("aria-pressed") === "true";
  }

  seekTo(time: number): void {
    const video = document.querySelector(
      SELECTORS.videoElement,
    ) as HTMLVideoElement | null;
    if (video) {
      video.currentTime = time;
    }
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

  clickQuickPicksPlayAll(): boolean {
    const shelves = document.querySelectorAll(SELECTORS.shelfRenderer);

    for (const shelf of shelves) {
      const shelfText = shelf.textContent?.toLowerCase() ?? "";
      if (!shelfText.includes("quick picks")) continue;

      const playAll = shelf.querySelector("a.play-all") as HTMLElement | null;
      if (playAll) {
        playAll.click();
        return true;
      }
      return false;
    }

    return false;
  }

  private parseSubtitle(): { album: string | null; year: number | null } {
    const subtitleEl = document.querySelector(SELECTORS.subtitle);
    if (!subtitleEl) return { album: null, year: null };

    const links = subtitleEl.querySelectorAll("a");
    const album =
      links.length >= 2 ? (links[1].textContent?.trim() ?? null) : null;

    const text = subtitleEl.textContent ?? "";
    const yearMatch = text.match(/\b((?:19|20)\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    return { album, year };
  }

  private upscaleArtworkUrl(url: string | null): string | null {
    if (!url) return null;
    return url.replace(/=w\d+-h\d+[^&]*/, "=w544-h544-l90-rj");
  }

  private readVideoTime(): { progress: number; duration: number } {
    const video = document.querySelector(
      SELECTORS.videoElement,
    ) as HTMLVideoElement | null;
    if (!video) return { progress: 0, duration: 0 };

    const progress = video.currentTime || 0;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    return { progress, duration };
  }

  private isPlaying(): boolean {
    const el = document.querySelector(SELECTORS.playPauseButton);
    return el?.getAttribute("title")?.toLowerCase() === "pause";
  }

  private clickButton(selector: string): void {
    const el = document.querySelector(selector) as HTMLElement | null;
    el?.click();
  }

  private isElementVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    return el.getClientRects().length > 0;
  }
}

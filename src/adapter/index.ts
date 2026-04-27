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

    const shuffleEl = document.querySelector(SELECTORS.shuffleButton);
    const repeatEl = document.querySelector(SELECTORS.repeatButton);

    // Shuffle has no aria-pressed or state attribute; detect via computed color.
    // Repeat uses title ("Repeat off" / "Repeat all" / "Repeat one").
    const isShuffling = this.isToggleActiveByColor(shuffleEl);
    const repeatTitle = repeatEl?.getAttribute("title")?.toLowerCase() ?? "";

    let repeatMode: "off" | "all" | "one" = "off";
    if (repeatTitle.includes("one")) repeatMode = "one";
    else if (repeatTitle.includes("all")) repeatMode = "all";

    return {
      title: titleEl?.textContent?.trim() ?? null,
      artist: artistEl?.textContent?.trim() ?? null,
      album,
      year,
      artworkUrl: this.upscaleArtworkUrl(artworkEl?.src ?? null),
      isPlaying,
      progress,
      duration,
      isShuffling,
      repeatMode,
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

  // Read from the volume slider element, not video.volume —
  // video.volume doesn't reflect YTM's UI-level volume.
  getVolume(): number {
    const slider = document.querySelector<HTMLElement>(SELECTORS.volumeSlider);
    const value = Number(slider?.getAttribute("value") ?? 100);
    return value / 100;
  }

  setVolume(volume: number): void {
    const slider = document.querySelector<HTMLElement>(SELECTORS.volumeSlider);
    if (!slider) return;
    const value = Math.round(volume * 100);
    slider.setAttribute("value", String(value));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  }

  isCurrentTrackDisliked(): boolean {
    const renderer = document.querySelector(SELECTORS.likeButtonRenderer);
    return renderer?.getAttribute("like-status") === "DISLIKE";
  }

  isCurrentTrackLiked(): boolean {
    const renderer = document.querySelector(SELECTORS.likeButtonRenderer);
    return renderer?.getAttribute("like-status") === "LIKE";
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

      case "shuffle":
        this.clickButton(SELECTORS.shuffleButton);
        break;

      case "repeat":
        this.clickButton(SELECTORS.repeatButton);
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
    // Prefer #progress-bar — its value/max are per-track. video.duration can
    // jump to the queue-wide total when YTM concatenates upcoming tracks into
    // a single MediaSource buffer, making song times read way too long.
    const bar = document.querySelector<HTMLElement>(SELECTORS.progressBar);
    if (bar) {
      const max = Number(bar.getAttribute("max"));
      if (Number.isFinite(max) && max > 0) {
        const value = Number(bar.getAttribute("value"));
        return {
          progress: Number.isFinite(value) ? value : 0,
          duration: max,
        };
      }
    }

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

  toggleLike(): void {
    this.clickButton(SELECTORS.likeButton);
  }

  toggleDislike(): void {
    this.clickButton(SELECTORS.dislikeButton);
  }

  /**
   * Detect whether a YTM toggle button is active by its computed
   * text color.  YTM renders active toggles as white (#fff /
   * rgb(255,255,255)) and inactive ones as gray.
   */
  private isToggleActiveByColor(el: Element | null): boolean {
    if (!el) return false;
    const color = window.getComputedStyle(el as HTMLElement).color;
    return color === "rgb(255, 255, 255)";
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

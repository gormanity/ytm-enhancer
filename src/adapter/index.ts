import { SELECTORS } from "./selectors";
import { debug } from "@/core/logger";
import type {
  PlaybackAction,
  PlaybackState,
  TrackMetadata,
} from "@/core/types";

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
    const artworkEl = document.querySelector(
      SELECTORS.albumArt,
    ) as HTMLImageElement | null;
    const isPlaying = this.isPlaying();

    const { progress, duration } = this.readVideoTime();

    const mediaSessionMetadata = this.readMediaSessionMetadata();
    const subtitleMetadata = this.parseSubtitle();

    const shuffleEl = document.querySelector(SELECTORS.shuffleButton);
    const repeatEl = document.querySelector(SELECTORS.repeatButton);

    // Shuffle has no reliable aria-pressed state; detect via computed color.
    // Repeat tooltips can describe the next action, so prefer current-state
    // attributes and icons before falling back to legacy title text.
    const isShuffling = this.isToggleActiveByColor(shuffleEl);
    const repeatMode = this.readRepeatMode(repeatEl);

    return {
      title:
        this.trimmedText(titleEl?.textContent) ?? mediaSessionMetadata.title,
      artist: mediaSessionMetadata.artist ?? subtitleMetadata.artist,
      album: mediaSessionMetadata.album ?? subtitleMetadata.album,
      year: subtitleMetadata.year,
      artworkUrl: this.upscaleArtworkUrl(
        artworkEl?.src ?? mediaSessionMetadata.artworkUrl,
      ),
      nextTrack: this.readNextTrack(),
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
    const seekTime = Number.isFinite(time) ? Math.max(0, time) : 0;
    const progressBar = document.querySelector<HTMLElement>(
      SELECTORS.progressBar,
    );
    if (progressBar) {
      this.updateSeekProgressControl(progressBar, seekTime);
      return;
    }

    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    if (video) {
      video.currentTime = seekTime;
    }
  }

  executeAction(action: PlaybackAction): void {
    switch (action) {
      case "togglePlay":
        if (!this.clickLoadedPlayerBarPlayPause()) {
          this.clickFirstPlayButtonWhenPlayerBarClosed();
        }
        break;

      case "play":
        if (!this.isPlaying()) {
          if (!this.clickLoadedPlayerBarPlayPause()) {
            this.clickFirstPlayButtonWhenPlayerBarClosed();
          }
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
        this.toggleShuffleMode();
        break;

      case "repeat":
        this.advanceRepeatMode();
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

  clickFirstPlayButtonWhenPlayerBarClosed(): boolean {
    const playerBarButton = document.querySelector<HTMLElement>(
      SELECTORS.playPauseButton,
    );
    if (playerBarButton) {
      const reason = this.getNotClickableReason(playerBarButton);
      if (!reason) {
        if (this.hasLoadedPlayerBarTrack()) {
          debug(
            "AutoPlay: visible player bar play button exists; skip page play scan",
          );
          return false;
        }
        debug(
          "AutoPlay: player bar play button is visible without loaded track; scan page play buttons",
        );
      }
      if (reason) {
        debug("AutoPlay: player bar play button is not clickable", { reason });
      }
    }

    const candidates = document.querySelectorAll<HTMLElement>(
      [
        'button[aria-label^="Play" i]',
        'button[title^="Play" i]',
        '[role="button"][aria-label^="Play" i]',
        '[role="button"][title^="Play" i]',
        'yt-icon-button[aria-label^="Play" i]',
        'yt-icon-button[title^="Play" i]',
        'tp-yt-paper-icon-button[aria-label^="Play" i]',
        'tp-yt-paper-icon-button[title^="Play" i]',
        "ytmusic-play-button-renderer",
        "a.play-all",
      ].join(","),
    );

    debug("AutoPlay: page play scan candidates", candidates.length);

    for (const candidate of candidates) {
      const reason = this.getNotClickableReason(candidate);
      if (reason) {
        debug("AutoPlay: skipping page play candidate", {
          reason,
          tag: candidate.tagName.toLowerCase(),
          ariaLabel: candidate.getAttribute("aria-label"),
          title: candidate.getAttribute("title"),
          role: candidate.getAttribute("role"),
          className: candidate.className,
          text: candidate.textContent?.trim().slice(0, 80),
        });
        continue;
      }
      debug("AutoPlay: clicking page play candidate", {
        tag: candidate.tagName.toLowerCase(),
        ariaLabel: candidate.getAttribute("aria-label"),
        title: candidate.getAttribute("title"),
        role: candidate.getAttribute("role"),
        className: candidate.className,
        text: candidate.textContent?.trim().slice(0, 80),
      });
      this.activateClick(candidate);
      return true;
    }

    return false;
  }

  private parseSubtitle(): {
    artist: string | null;
    album: string | null;
    year: number | null;
  } {
    const subtitleEl = document.querySelector(SELECTORS.subtitle);
    return this.parseLinkedMetadata(subtitleEl);
  }

  private parseLinkedMetadata(container: Element | null): {
    artist: string | null;
    album: string | null;
    year: number | null;
  } {
    if (!container) return { artist: null, album: null, year: null };

    const links = Array.from(container.querySelectorAll("a"));
    const text = container.textContent ?? "";
    const textSegments = this.parseMetadataTextSegments(text);
    const albumLink = links.find((link) => this.isAlbumLink(link));
    const artistLink = links.find((link) => this.isArtistLink(link));
    const artist =
      this.trimmedText(artistLink?.textContent) ??
      (links.length >= 2 || !albumLink
        ? this.trimmedText(links[0]?.textContent)
        : null) ??
      (links.length === 0 ? (textSegments[0] ?? null) : null);
    const album =
      this.trimmedText(albumLink?.textContent) ??
      (links.length >= 2 ? this.trimmedText(links[1]?.textContent) : null) ??
      (links.length === 0 ? (textSegments[1] ?? null) : null);

    const yearMatch = text.match(/\b((?:19|20)\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    return { artist, album, year };
  }

  private parseMetadataTextSegments(text: string): string[] {
    return text
      .split(/[•·]/)
      .map((segment) => this.trimmedText(segment.replace(/\s+/g, " ")))
      .filter(
        (segment): segment is string =>
          segment !== null && !/^(?:19|20)\d{2}$/.test(segment),
      );
  }

  private readNextTrack(): TrackMetadata | null {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(SELECTORS.queueItem),
    );
    const currentIndex = items.findIndex((item) =>
      this.isCurrentQueueItem(item),
    );
    if (currentIndex < 0) return null;

    const nextItem = items[currentIndex + 1];
    if (!nextItem) return null;

    return this.readQueueItemMetadata(nextItem);
  }

  private isCurrentQueueItem(item: HTMLElement): boolean {
    if (
      item.matches(
        [
          "[selected]",
          ".selected",
          '[aria-current="true"]',
          '[aria-selected="true"]',
        ].join(","),
      )
    ) {
      return true;
    }

    return (
      item.querySelector(
        [
          '[aria-label^="Pause" i]',
          '[title^="Pause" i]',
          '[aria-label*="Currently playing" i]',
          '[title*="Currently playing" i]',
        ].join(","),
      ) !== null
    );
  }

  private readQueueItemMetadata(item: HTMLElement): TrackMetadata | null {
    const title = this.trimmedText(
      item.querySelector<HTMLElement>(SELECTORS.queueItemTitle)?.textContent,
    );
    if (!title) return null;

    const byline = item.querySelector<HTMLElement>(SELECTORS.queueItemByline);
    const { artist, album, year } = this.parseLinkedMetadata(byline);
    const artworkUrl = this.upscaleArtworkUrl(
      this.trimmedText(
        item.querySelector<HTMLImageElement>(SELECTORS.queueItemThumbnail)?.src,
      ),
    );

    return { title, artist, album, year, artworkUrl };
  }

  private readMediaSessionMetadata(): {
    title: string | null;
    artist: string | null;
    album: string | null;
    artworkUrl: string | null;
  } {
    const metadata = navigator.mediaSession?.metadata;

    return {
      title: this.trimmedText(metadata?.title),
      artist: this.trimmedText(metadata?.artist),
      album: this.trimmedText(metadata?.album),
      artworkUrl: this.trimmedText(metadata?.artwork?.at(-1)?.src),
    };
  }

  private isArtistLink(link: HTMLAnchorElement): boolean {
    const href = link.getAttribute("href") ?? "";
    return href.includes("/channel/") || href.includes("/browse/UC");
  }

  private isAlbumLink(link: HTMLAnchorElement): boolean {
    const href = link.getAttribute("href") ?? "";
    return href.includes("/browse/MPRE") || href.includes("list=OLAK5uy_");
  }

  private trimmedText(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed ? trimmed : null;
  }

  private upscaleArtworkUrl(url: string | null): string | null {
    if (!url) return null;
    return url.replace(/=w\d+-h\d+[^&]*/, "=w544-h544-l90-rj");
  }

  private readVideoTime(): { progress: number; duration: number } {
    // Prefer #time-info text — it shows YTM's authoritative per-track
    // times. Both video.duration and #progress-bar.max can be queue-wide
    // when YTM concatenates upcoming tracks into a single MediaSource
    // buffer, making song times read way too long.
    const timeInfo = this.parseTimeInfo();
    if (timeInfo.duration > 0) return timeInfo;

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

  private updateSeekProgressControl(
    progressBar: HTMLElement,
    time: number,
  ): void {
    const min = this.readElementNumber(progressBar, ["min", "aria-valuemin"]);
    const max = this.readElementNumber(progressBar, ["max", "aria-valuemax"]);
    const clampedTime = Math.min(
      max ?? Number.POSITIVE_INFINITY,
      Math.max(min ?? 0, time),
    );
    const value = String(clampedTime);

    if ("value" in progressBar) {
      (progressBar as HTMLInputElement).value = value;
    }
    progressBar.setAttribute("value", value);
    progressBar.setAttribute("aria-valuenow", value);

    const view = progressBar.ownerDocument.defaultView ?? window;
    for (const type of ["input", "change"]) {
      progressBar.dispatchEvent(
        new view.Event(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    }
  }

  private readElementNumber(
    el: HTMLElement | null,
    attributes: string[],
  ): number | null {
    if (!el) return null;

    if (attributes.includes("value") && "value" in el) {
      const value = this.parseFiniteElementNumber(
        (el as HTMLInputElement).value,
      );
      if (value !== null) return value;
    }

    for (const attribute of attributes) {
      const value = this.parseFiniteElementNumber(el.getAttribute(attribute));
      if (value !== null) return value;
    }

    return null;
  }

  private parseFiniteElementNumber(
    value: string | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseTimeInfo(): { progress: number; duration: number } {
    const candidates = document.querySelectorAll<HTMLElement>(
      SELECTORS.timeInfo,
    );

    for (const el of candidates) {
      const parsed = this.parseTimeInfoText(el.textContent?.trim() ?? "");
      if (parsed.duration > 0) return parsed;
    }

    return { progress: 0, duration: 0 };
  }

  private parseTimeInfoText(text: string): {
    progress: number;
    duration: number;
  } {
    const match = text.match(/^(.+?)\s*\/\s*(.+)$/);
    if (!match) return { progress: 0, duration: 0 };
    return {
      progress: this.parseTimestamp(match[1].trim()),
      duration: this.parseTimestamp(match[2].trim()),
    };
  }

  private parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(":").map(Number);
    if (parts.some((p) => !Number.isFinite(p))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }

  private isPlaying(): boolean {
    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    if (video && !video.paused && !video.ended) return true;

    const el = document.querySelector(SELECTORS.playPauseButton);
    return el?.getAttribute("title")?.toLowerCase() === "pause";
  }

  private clickButton(selector: string): boolean {
    const el = this.findClickableElement(selector);
    if (!el) {
      debug("PlaybackAction: no clickable element found", {
        selector,
        matches: document.querySelectorAll(selector).length,
      });
      return false;
    }
    this.activateClick(el);
    return true;
  }

  private clickNativeButton(selector: string): boolean {
    const el = this.findClickableElement(selector);
    if (!el) {
      debug("PlaybackAction: no clickable element found", {
        selector,
        matches: document.querySelectorAll(selector).length,
      });
      return false;
    }
    this.findActivationTarget(el).click();
    return true;
  }

  private toggleShuffleMode(): void {
    const el = this.findClickableElement(SELECTORS.shuffleButton);
    if (!el) {
      debug("PlaybackAction: no clickable element found", {
        selector: SELECTORS.shuffleButton,
        matches: document.querySelectorAll(SELECTORS.shuffleButton).length,
      });
      return;
    }

    const target = this.findActivationTarget(el);
    if (this.isToggleActiveByColor(el)) {
      this.activateClick(target);
      return;
    }

    target.click();
  }

  private advanceRepeatMode(): void {
    const initialMode = this.readCurrentRepeatMode();
    const targetMode = this.nextRepeatMode(initialMode);

    if (!this.clickButton(SELECTORS.repeatButton)) return;

    let currentMode = this.readCurrentRepeatMode();
    if (currentMode === targetMode || currentMode === initialMode) return;

    for (let attempts = 1; attempts < 3; attempts += 1) {
      if (!this.clickButton(SELECTORS.repeatButton)) return;
      currentMode = this.readCurrentRepeatMode();
      if (currentMode === targetMode) return;
    }
  }

  private readCurrentRepeatMode(): "off" | "all" | "one" {
    return this.readRepeatMode(document.querySelector(SELECTORS.repeatButton));
  }

  private nextRepeatMode(mode: "off" | "all" | "one"): "off" | "all" | "one" {
    switch (mode) {
      case "off":
        return "all";
      case "all":
        return "one";
      case "one":
        return "off";
    }
  }

  private clickLoadedPlayerBarPlayPause(): boolean {
    const el = document.querySelector<HTMLElement>(SELECTORS.playPauseButton);
    if (!el) {
      debug("PlaybackAction: player bar play/pause missing");
      return false;
    }
    const reason = this.getNotClickableReason(el);
    if (reason) {
      debug("PlaybackAction: player bar play/pause not clickable", { reason });
      return false;
    }
    if (!this.hasLoadedPlayerBarTrack()) {
      debug("PlaybackAction: player bar has no loaded track");
      return false;
    }

    this.activateClick(el);
    return true;
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
    const candidates = [el, ...Array.from(el.querySelectorAll("*"))];
    return candidates.some((candidate) => {
      const color = window.getComputedStyle(candidate as HTMLElement).color;
      return color === "rgb(255, 255, 255)";
    });
  }

  private readRepeatMode(el: Element | null): "off" | "all" | "one" {
    if (!el) return "off";

    const pressed = this.readPressedState(el);
    const iconMode = this.readRepeatIconMode(el);
    if (iconMode === "one") return "one";

    const isActive = pressed === true || this.isToggleActiveByColor(el);
    const labelEntries = this.readRepeatLabelEntries(el);
    const stateLabelMode = this.readRepeatStateLabelMode(labelEntries);
    if (stateLabelMode !== null) return stateLabelMode;

    const labelText = labelEntries.map((entry) => entry.value).join(" ");
    if (isActive && labelText.includes("off")) {
      return "one";
    }

    if (pressed === false) return "off";

    if (iconMode === "all") {
      return isActive ? "all" : "off";
    }

    if (isActive) return "all";

    if (labelText.includes("one")) return "one";
    if (labelText.includes("all")) return "all";
    return "off";
  }

  private readRepeatLabelEntries(
    el: Element,
  ): Array<{ attribute: string; value: string }> {
    const attributes = [
      "aria-label",
      "aria-description",
      "label",
      "data-tooltip",
      "data-tooltip-text",
      "data-title",
      "title",
    ];
    return [el, ...Array.from(el.querySelectorAll("*"))]
      .flatMap((node) =>
        attributes.map((attribute) => ({
          attribute,
          value: node.getAttribute(attribute)?.trim().toLowerCase() ?? "",
        })),
      )
      .filter((entry) => entry.value.length > 0);
  }

  private readRepeatStateLabelMode(
    entries: Array<{ attribute: string; value: string }>,
  ): "off" | "all" | "one" | null {
    for (const entry of entries) {
      if (entry.attribute !== "aria-label" && entry.attribute !== "label") {
        continue;
      }

      if (entry.value === "repeat one") return "one";
      if (entry.value === "repeat all") return "all";
      if (entry.value === "repeat off") return "off";
    }

    return null;
  }

  private readPressedState(el: Element): boolean | null {
    for (const attribute of ["aria-pressed", "aria-checked"]) {
      const value = el.getAttribute(attribute)?.toLowerCase();
      if (value === "true") return true;
      if (value === "false") return false;
    }

    return null;
  }

  private readRepeatIconMode(el: Element): "all" | "one" | null {
    const iconText = [
      el.getAttribute("icon"),
      el.getAttribute("data-icon"),
      el.getAttribute("aria-label"),
      ...Array.from(el.querySelectorAll("[icon], [data-icon], svg, path")).map(
        (node) =>
          [
            node.getAttribute("icon"),
            node.getAttribute("data-icon"),
            node.getAttribute("aria-label"),
            node.getAttribute("class"),
            node.getAttribute("d"),
            node.outerHTML,
          ].join(" "),
      ),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (/\brepeat[-_. ]?one\b/.test(iconText)) return "one";
    if (/\brepeat[-_. ]?(?:all|playlist)?\b/.test(iconText)) return "all";
    return null;
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

  private getNotClickableReason(el: HTMLElement): string | null {
    if (
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true"
    ) {
      return "disabled";
    }

    if (!this.isElementVisible(el)) return "not visible";

    return null;
  }

  private hasLoadedPlayerBarTrack(): boolean {
    const title = document.querySelector(SELECTORS.trackTitle);
    if (title?.textContent?.trim()) return true;

    const thumbnail = document.querySelector<HTMLImageElement>(
      SELECTORS.albumArt,
    );
    if (thumbnail?.src) return true;

    const timeInfo = document.querySelector(SELECTORS.timeInfo);
    return Boolean(timeInfo?.textContent?.trim());
  }

  private findClickableElement(selector: string): HTMLElement | null {
    const elements = document.querySelectorAll<HTMLElement>(selector);

    for (const el of elements) {
      if (!this.getNotClickableReason(el)) return el;
    }

    return null;
  }

  private activateClick(el: HTMLElement): void {
    const target = this.findActivationTarget(el);
    const view = target.ownerDocument.defaultView ?? window;

    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      target.dispatchEvent(
        new view.MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    }
  }

  private findActivationTarget(el: HTMLElement): HTMLElement {
    const nested = el.querySelector<HTMLElement>(
      [
        "button",
        '[role="button"]',
        "yt-icon-button",
        "tp-yt-paper-icon-button",
        "paper-icon-button-light",
        'button[aria-label^="Play" i]',
        'button[title^="Play" i]',
        '[role="button"][aria-label^="Play" i]',
        '[role="button"][title^="Play" i]',
        'yt-icon-button[aria-label^="Play" i]',
        'yt-icon-button[title^="Play" i]',
        'tp-yt-paper-icon-button[aria-label^="Play" i]',
        'tp-yt-paper-icon-button[title^="Play" i]',
        "a.play-all",
      ].join(","),
    );

    if (nested && !this.getNotClickableReason(nested)) return nested;

    return el;
  }
}

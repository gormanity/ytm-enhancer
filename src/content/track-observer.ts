import { SELECTORS } from "@/adapter/selectors";
import type { PlaybackState } from "@/core/types";

const DEBOUNCE_MS = 150;

export class TrackObserver {
  private titleObserver: MutationObserver | null = null;
  private subtitleObserver: MutationObserver | null = null;
  private buttonObserver: MutationObserver | null = null;
  private discoveryObserver: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTrackKey: string | null = null;
  private getPlaybackState: () => PlaybackState;
  private onTrackChange?: (state: PlaybackState) => void;

  constructor(
    getPlaybackState: () => PlaybackState,
    onTrackChange?: (state: PlaybackState) => void,
  ) {
    this.getPlaybackState = getPlaybackState;
    this.onTrackChange = onTrackChange;
  }

  start(): void {
    const elements = this.findElements();

    if (elements) {
      this.observeElements(
        elements.titleEl,
        elements.subtitleEl,
        elements.buttonEl,
      );
      this.scheduleCheck();
    } else {
      this.waitForElements();
    }
  }

  stop(): void {
    this.titleObserver?.disconnect();
    this.titleObserver = null;
    this.subtitleObserver?.disconnect();
    this.subtitleObserver = null;
    this.buttonObserver?.disconnect();
    this.buttonObserver = null;
    this.discoveryObserver?.disconnect();
    this.discoveryObserver = null;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Find the three DOM elements needed for observation.
   *
   * For the artist, we locate the <a> via the known-working artistName
   * selector, then walk up to the nearest <span> container. The <a>
   * itself gets destroyed and recreated on every track change, but
   * the parent <span class="subtitle ..."> persists.
   */
  private findElements(): {
    titleEl: Element;
    subtitleEl: Element;
    buttonEl: Element;
  } | null {
    const titleEl = document.querySelector(SELECTORS.trackTitle);
    const artistEl = document.querySelector(SELECTORS.artistName);
    const buttonEl = document.querySelector(SELECTORS.playPauseButton);

    if (!titleEl || !artistEl || !buttonEl) return null;

    const subtitleEl = artistEl.closest("span") ?? artistEl;
    return { titleEl, subtitleEl, buttonEl };
  }

  private observeElements(
    titleEl: Element,
    subtitleEl: Element,
    buttonEl: Element,
  ): void {
    const handler = () => {
      this.scheduleCheck();
    };

    this.titleObserver = new MutationObserver(handler);
    this.titleObserver.observe(titleEl, {
      characterData: true,
      subtree: true,
      childList: true,
    });

    this.subtitleObserver = new MutationObserver(handler);
    this.subtitleObserver.observe(subtitleEl, {
      characterData: true,
      subtree: true,
      childList: true,
    });

    this.buttonObserver = new MutationObserver(handler);
    this.buttonObserver.observe(buttonEl, {
      attributes: true,
      attributeFilter: ["title"],
    });
  }

  private waitForElements(): void {
    this.discoveryObserver = new MutationObserver(() => {
      const elements = this.findElements();

      if (elements) {
        this.discoveryObserver?.disconnect();
        this.discoveryObserver = null;
        this.observeElements(
          elements.titleEl,
          elements.subtitleEl,
          elements.buttonEl,
        );
        this.scheduleCheck();
      }
    });

    this.discoveryObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private scheduleCheck(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.checkTrack();
    }, DEBOUNCE_MS);
  }

  private checkTrack(): void {
    const state = this.getPlaybackState();

    if (!state.isPlaying) {
      this.lastTrackKey = null;
      return;
    }
    if (!state.title || !state.artist) return;

    const trackKey = `${state.title}\0${state.artist}`;
    if (trackKey === this.lastTrackKey) return;

    this.lastTrackKey = trackKey;
    try {
      chrome.runtime.sendMessage({ type: "track-changed", state });
    } catch {
      // Extension may have been reloaded and invalidated this content context.
    }
    this.onTrackChange?.(state);
  }
}

import { SELECTORS } from "@/adapter/selectors";
import type { PlaybackState } from "@/core/types";

export class TrackObserver {
  private titleObserver: MutationObserver | null = null;
  private buttonObserver: MutationObserver | null = null;
  private discoveryObserver: MutationObserver | null = null;
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
    const titleEl = document.querySelector(SELECTORS.trackTitle);
    const buttonEl = document.querySelector(SELECTORS.playPauseButton);

    if (titleEl && buttonEl) {
      this.observeElements(titleEl, buttonEl);
    } else {
      this.waitForElements();
    }
  }

  stop(): void {
    this.titleObserver?.disconnect();
    this.titleObserver = null;
    this.buttonObserver?.disconnect();
    this.buttonObserver = null;
    this.discoveryObserver?.disconnect();
    this.discoveryObserver = null;
  }

  private observeElements(titleEl: Element, buttonEl: Element): void {
    const handler = () => this.checkTrack();

    this.titleObserver = new MutationObserver(handler);
    this.titleObserver.observe(titleEl, {
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
      const titleEl = document.querySelector(SELECTORS.trackTitle);
      const buttonEl = document.querySelector(SELECTORS.playPauseButton);

      if (titleEl && buttonEl) {
        this.discoveryObserver?.disconnect();
        this.discoveryObserver = null;
        this.observeElements(titleEl, buttonEl);
      }
    });

    this.discoveryObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
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
    chrome.runtime.sendMessage({ type: "track-changed", state });
    this.onTrackChange?.(state);
  }
}

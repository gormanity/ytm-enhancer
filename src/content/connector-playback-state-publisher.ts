import { SELECTORS } from "@/adapter/selectors";
import type { PlaybackState } from "@/core/types";

const MEDIA_REFRESH_EVENTS = [
  "play",
  "pause",
  "timeupdate",
  "durationchange",
  "loadedmetadata",
  "ratechange",
  "seeked",
] as const;
const DEFAULT_TIMEUPDATE_INTERVAL_MS = 1000;

export interface ConnectorPlaybackStatePublisherOptions {
  timeupdateIntervalMs?: number;
  now?: () => number;
}

export class ConnectorPlaybackStatePublisher {
  private enabled = false;
  private video: HTMLVideoElement | null = null;
  private observer: MutationObserver | null = null;
  private lastTimeupdatePublishedAt = Number.NEGATIVE_INFINITY;
  private readonly timeupdateIntervalMs: number;
  private readonly now: () => number;

  constructor(
    private readonly getPlaybackState: () => PlaybackState,
    private readonly publish: (state: PlaybackState) => void,
    options: ConnectorPlaybackStatePublisherOptions = {},
  ) {
    this.timeupdateIntervalMs =
      options.timeupdateIntervalMs ?? DEFAULT_TIMEUPDATE_INTERVAL_MS;
    this.now = options.now ?? Date.now;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;

    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  stop(): void {
    this.enabled = false;
    this.detachVideo();
    this.observer?.disconnect();
    this.observer = null;
    this.lastTimeupdatePublishedAt = Number.NEGATIVE_INFINITY;
  }

  private start(): void {
    this.attachCurrentVideo();
    this.observeVideoChanges();
  }

  private observeVideoChanges(): void {
    if (this.observer !== null) return;
    if (!document.body) return;

    this.observer = new MutationObserver(() => {
      this.attachCurrentVideo();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private attachCurrentVideo(): void {
    if (!this.enabled) return;

    const nextVideo = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    if (nextVideo === this.video) return;

    this.detachVideo();
    this.video = nextVideo;
    for (const eventName of MEDIA_REFRESH_EVENTS) {
      this.video?.addEventListener(eventName, this.onMediaEvent);
    }
  }

  private detachVideo(): void {
    if (this.video === null) return;

    for (const eventName of MEDIA_REFRESH_EVENTS) {
      this.video.removeEventListener(eventName, this.onMediaEvent);
    }
    this.video = null;
  }

  private readonly onMediaEvent = (event: Event): void => {
    if (!this.enabled) return;
    if (event.type === "timeupdate" && !this.shouldPublishTimeupdate()) return;
    this.publishCurrentState();
  };

  private shouldPublishTimeupdate(): boolean {
    const now = this.now();
    if (now - this.lastTimeupdatePublishedAt < this.timeupdateIntervalMs) {
      return false;
    }
    this.lastTimeupdatePublishedAt = now;
    return true;
  }

  private publishCurrentState(): void {
    try {
      this.publish(this.getPlaybackState());
    } catch {
      // Connector streaming must not interfere with YouTube Music playback.
    }
  }
}

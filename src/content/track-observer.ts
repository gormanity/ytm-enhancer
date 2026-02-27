import type { PlaybackState } from "@/core/types";

const POLL_INTERVAL_MS = 2000;

export class TrackObserver {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTrackKey: string | null = null;
  private getPlaybackState: () => PlaybackState;

  constructor(getPlaybackState: () => PlaybackState) {
    this.getPlaybackState = getPlaybackState;
  }

  start(): void {
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private poll(): void {
    const state = this.getPlaybackState();

    if (!state.isPlaying) return;
    if (!state.title || !state.artist) return;

    const trackKey = `${state.title}\0${state.artist}`;
    if (trackKey === this.lastTrackKey) return;

    this.lastTrackKey = trackKey;
    chrome.runtime.sendMessage({ type: "track-changed", state });
  }
}

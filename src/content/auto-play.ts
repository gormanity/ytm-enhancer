import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";

const TIMEOUT_MS = 10_000;

export class AutoPlayController {
  private adapter = new YTMAdapter();
  private observer: MutationObserver | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private messageListener: (message: { type: string; enabled?: boolean }) => void;

  constructor() {
    this.messageListener = (message) => {
      if (message.type === "set-auto-play-enabled") {
        this.enabled = message.enabled === true;
      }
    };
  }

  init(): void {
    chrome.runtime.onMessage.addListener(this.messageListener);

    chrome.runtime.sendMessage(
      { type: "get-auto-play-enabled" },
      (response: { ok: boolean; data?: boolean }) => {
        if (response?.ok && response.data === true) {
          this.enabled = true;
          this.tryAutoPlay();
        }
      },
    );
  }

  destroy(): void {
    chrome.runtime.onMessage.removeListener(this.messageListener);
    this.observer?.disconnect();
    this.observer = null;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private tryAutoPlay(): void {
    const playPauseButton = document.querySelector(
      SELECTORS.playPauseButton,
    );

    if (playPauseButton) {
      this.performAutoPlay();
    } else {
      this.waitForPlayerBar();
    }
  }

  private waitForPlayerBar(): void {
    this.observer = new MutationObserver(() => {
      const playPauseButton = document.querySelector(
        SELECTORS.playPauseButton,
      );

      if (playPauseButton) {
        this.observer?.disconnect();
        this.observer = null;
        if (this.timeoutId !== null) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        this.performAutoPlay();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.timeoutId = setTimeout(() => {
      this.observer?.disconnect();
      this.observer = null;
      this.timeoutId = null;
    }, TIMEOUT_MS);
  }

  private performAutoPlay(): void {
    const state = this.adapter.getPlaybackState();

    if (state.isPlaying) return;

    if (state.title !== null) {
      this.adapter.executeAction("play");
      return;
    }

    // No track loaded -- try clicking Quick Picks Play All
    const clicked = this.adapter.clickQuickPicksPlayAll();
    if (!clicked) {
      // Last resort: try play action (may resume last queue)
      this.adapter.executeAction("play");
    }
  }
}

import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";

const TIMEOUT_MS = 10_000;
const HAVE_FUTURE_DATA = 3;
const INITIAL_SUPPRESSION_MAX_AGE_MS = 8_000;

export class AutoPlayController {
  private adapter = new YTMAdapter();
  private observer: MutationObserver | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private canplayHandler: (() => void) | null = null;
  private canplayVideo: HTMLVideoElement | null = null;
  private suppressObserver: MutationObserver | null = null;
  private suppressTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private suppressPlayHandler: (() => void) | null = null;
  private suppressVideo: HTMLVideoElement | null = null;
  private suppressArmed = false;
  private enabled = false;
  private messageListener: (message: {
    type: string;
    enabled?: boolean;
  }) => void;

  constructor() {
    this.messageListener = (message) => {
      if (message.type === "set-auto-play-enabled") {
        const nextEnabled = message.enabled === true;
        if (nextEnabled === this.enabled) return;
        this.enabled = nextEnabled;
        if (this.enabled) {
          this.cancelInitialSuppression();
        } else {
          this.cancelPendingAutoPlay();
        }
      }
    };
  }

  init(): void {
    chrome.runtime.onMessage.addListener(this.messageListener);

    try {
      chrome.runtime.sendMessage(
        { type: "get-auto-play-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (chrome.runtime.lastError) return;
          this.enabled = response?.ok === true && response.data === true;
          if (this.enabled) {
            this.tryAutoPlay();
          } else if (this.shouldSuppressInitialPlayback()) {
            this.armInitialSuppression();
          }
        },
      );
    } catch {
      // Extension may have been reloaded and invalidated this content context.
    }
  }

  destroy(): void {
    chrome.runtime.onMessage.removeListener(this.messageListener);
    this.observer?.disconnect();
    this.observer = null;
    this.clearCanplayListener();
    this.cancelInitialSuppression();
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private tryAutoPlay(): void {
    if (!this.enabled) return;

    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );

    if (video) {
      this.onVideoFound(video);
    } else {
      this.waitForVideo();
    }
  }

  /**
   * Once the video element exists, check if the media is ready.
   * If readyState >= HAVE_FUTURE_DATA the media is loaded and
   * we can play immediately. Otherwise wait for the canplay event,
   * which fires after YTM finishes its internal pause/load cycle.
   */
  private onVideoFound(video: HTMLVideoElement): void {
    if (!this.enabled) return;
    if (video.readyState >= HAVE_FUTURE_DATA) {
      this.performAutoPlay(video);
    } else {
      this.waitForCanplay(video);
    }
  }

  private waitForCanplay(video: HTMLVideoElement): void {
    this.canplayHandler = () => {
      if (!this.enabled) return;
      this.clearCanplayListener();
      this.performAutoPlay(video);
    };
    this.canplayVideo = video;
    video.addEventListener("canplay", this.canplayHandler, { once: true });
  }

  private clearCanplayListener(): void {
    if (this.canplayHandler && this.canplayVideo) {
      this.canplayVideo.removeEventListener("canplay", this.canplayHandler);
    }
    this.canplayHandler = null;
    this.canplayVideo = null;
  }

  /**
   * Wait for the video element to appear in the DOM. YTM creates
   * the <video> element during player initialization. Clicking the
   * play-pause button before the player API is wired up throws
   * "playerApi.playVideo is not a function".
   */
  private waitForVideo(): void {
    this.observer = new MutationObserver(() => {
      if (!this.enabled) return;
      const video = document.querySelector<HTMLVideoElement>(
        SELECTORS.videoElement,
      );

      if (video) {
        this.observer?.disconnect();
        this.observer = null;
        if (this.timeoutId !== null) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        this.onVideoFound(video);
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

  private performAutoPlay(video: HTMLVideoElement): void {
    if (!this.enabled) return;

    const state = this.adapter.getPlaybackState();

    if (state.isPlaying) return;

    if (state.title !== null) {
      void video.play();
      return;
    }

    // No track loaded -- try clicking Quick Picks Play All
    const clicked = this.adapter.clickQuickPicksPlayAll();
    if (!clicked) {
      void video.play();
    }
  }

  private cancelPendingAutoPlay(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.clearCanplayListener();
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private shouldSuppressInitialPlayback(): boolean {
    return performance.now() <= INITIAL_SUPPRESSION_MAX_AGE_MS;
  }

  private armInitialSuppression(): void {
    if (this.suppressArmed) return;
    this.suppressArmed = true;

    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    if (video) {
      this.attachSuppression(video);
      return;
    }

    this.suppressObserver = new MutationObserver(() => {
      const found = document.querySelector<HTMLVideoElement>(
        SELECTORS.videoElement,
      );
      if (!found) return;
      this.suppressObserver?.disconnect();
      this.suppressObserver = null;
      this.attachSuppression(found);
    });

    this.suppressObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.suppressTimeoutId = setTimeout(() => {
      this.cancelInitialSuppression();
    }, TIMEOUT_MS);
  }

  private attachSuppression(video: HTMLVideoElement): void {
    if (!this.suppressArmed) return;
    this.suppressVideo = video;
    this.suppressPlayHandler = () => {
      if (!this.suppressArmed) return;
      video.pause();
      this.cancelInitialSuppression();
    };
    video.addEventListener("play", this.suppressPlayHandler);

    if (!video.paused) {
      video.pause();
      this.cancelInitialSuppression();
      return;
    }

    if (this.suppressTimeoutId === null) {
      this.suppressTimeoutId = setTimeout(() => {
        this.cancelInitialSuppression();
      }, TIMEOUT_MS);
    }
  }

  private cancelInitialSuppression(): void {
    this.suppressArmed = false;
    this.suppressObserver?.disconnect();
    this.suppressObserver = null;
    if (this.suppressTimeoutId !== null) {
      clearTimeout(this.suppressTimeoutId);
      this.suppressTimeoutId = null;
    }
    if (this.suppressVideo && this.suppressPlayHandler) {
      this.suppressVideo.removeEventListener("play", this.suppressPlayHandler);
    }
    this.suppressVideo = null;
    this.suppressPlayHandler = null;
  }
}

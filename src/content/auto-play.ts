import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";

const TIMEOUT_MS = 10_000;
const HAVE_FUTURE_DATA = 3;

export class AutoPlayController {
  private adapter = new YTMAdapter();
  private observer: MutationObserver | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private canplayHandler: (() => void) | null = null;
  private canplayVideo: HTMLVideoElement | null = null;
  private enabled = false;
  private messageListener: (message: {
    type: string;
    enabled?: boolean;
  }) => void;

  constructor() {
    this.messageListener = (message) => {
      if (message.type === "set-auto-play-enabled") {
        this.enabled = message.enabled === true;
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
          if (response?.ok && response.data === true) {
            this.enabled = true;
            this.tryAutoPlay();
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
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private tryAutoPlay(): void {
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
    if (video.readyState >= HAVE_FUTURE_DATA) {
      this.performAutoPlay(video);
    } else {
      this.waitForCanplay(video);
    }
  }

  private waitForCanplay(video: HTMLVideoElement): void {
    this.canplayHandler = () => {
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
}

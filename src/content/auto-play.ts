import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import type { AutoPlayMode } from "@/core/types";

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
  private suppressPointerHandler: ((event: PointerEvent) => void) | null = null;
  private suppressKeyboardHandler: ((event: KeyboardEvent) => void) | null =
    null;
  private suppressVideo: HTMLVideoElement | null = null;
  private suppressArmed = false;
  private mode: AutoPlayMode = "default";
  private messageListener: (message: {
    type: string;
    mode?: AutoPlayMode;
    enabled?: boolean;
  }) => void;

  constructor() {
    this.messageListener = (message) => {
      if (message.type === "set-auto-play-mode") {
        const nextMode = this.normalizeMode(message.mode);
        if (nextMode === this.mode) return;
        this.mode = nextMode;
        this.applyRuntimeMode();
        return;
      }

      if (message.type === "set-auto-play-enabled") {
        const nextMode = message.enabled === true ? "on" : "off";
        if (nextMode === this.mode) return;
        this.mode = nextMode;
        this.applyRuntimeMode();
      }
    };
  }

  init(): void {
    chrome.runtime.onMessage.addListener(this.messageListener);

    try {
      chrome.runtime.sendMessage(
        { type: "get-auto-play-mode" },
        (response: { ok: boolean; data?: AutoPlayMode }) => {
          if (chrome.runtime.lastError) return;
          this.mode =
            response?.ok === true
              ? this.normalizeMode(response.data)
              : "default";
          this.applyInitialMode();
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
    if (this.mode !== "on") return;

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
    if (this.mode !== "on") return;
    if (video.readyState >= HAVE_FUTURE_DATA) {
      this.performAutoPlay(video);
    } else {
      this.waitForCanplay(video);
    }
  }

  private waitForCanplay(video: HTMLVideoElement): void {
    this.canplayHandler = () => {
      if (this.mode !== "on") return;
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
      if (this.mode !== "on") return;
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
    if (this.mode !== "on") return;

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

  private applyInitialMode(): void {
    if (this.mode === "on") {
      this.cancelInitialSuppression();
      this.tryAutoPlay();
      return;
    }

    this.cancelPendingAutoPlay();

    if (this.mode === "off" && this.shouldSuppressInitialPlayback()) {
      this.armInitialSuppression();
      return;
    }

    this.cancelInitialSuppression();
  }

  private applyRuntimeMode(): void {
    if (this.mode === "on") {
      this.cancelInitialSuppression();
      return;
    }

    this.cancelPendingAutoPlay();
    if (this.mode === "default") {
      this.cancelInitialSuppression();
    }
  }

  private normalizeMode(mode: unknown): AutoPlayMode {
    return mode === "off" || mode === "on" || mode === "default"
      ? mode
      : "default";
  }

  private armInitialSuppression(): void {
    if (this.suppressArmed) return;
    this.suppressArmed = true;
    this.listenForUserPlayIntent();

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

  private listenForUserPlayIntent(): void {
    this.suppressPointerHandler = (event) => {
      if (this.eventTargetsPlayPauseButton(event)) {
        this.playFromUserIntent();
        this.cancelInitialSuppression();
      }
    };
    this.suppressKeyboardHandler = (event) => {
      if (
        (event.key === "Enter" || event.key === " ") &&
        this.eventTargetsPlayPauseButton(event)
      ) {
        this.playFromUserIntent();
        this.cancelInitialSuppression();
      }
    };

    document.addEventListener("pointerdown", this.suppressPointerHandler, {
      capture: true,
    });
    document.addEventListener("keydown", this.suppressKeyboardHandler, {
      capture: true,
    });
  }

  private eventTargetsPlayPauseButton(event: Event): boolean {
    return event
      .composedPath()
      .some(
        (target) =>
          target instanceof Element &&
          target.matches(SELECTORS.playPauseButton),
      );
  }

  private playFromUserIntent(): void {
    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );
    if (!video || !video.paused) return;
    void video.play().catch(() => {
      // Leave the native YTM handler to report/playback-manage failures.
    });
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
    if (this.suppressPointerHandler) {
      document.removeEventListener("pointerdown", this.suppressPointerHandler, {
        capture: true,
      });
    }
    if (this.suppressKeyboardHandler) {
      document.removeEventListener("keydown", this.suppressKeyboardHandler, {
        capture: true,
      });
    }
    this.suppressVideo = null;
    this.suppressPlayHandler = null;
    this.suppressPointerHandler = null;
    this.suppressKeyboardHandler = null;
  }
}

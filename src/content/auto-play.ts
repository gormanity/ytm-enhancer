import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import { debug } from "@/core/logger";
import type { AutoPlayMode } from "@/core/types";

const TIMEOUT_MS = 10_000;
const HAVE_FUTURE_DATA = 3;
const INITIAL_SUPPRESSION_MAX_AGE_MS = 8_000;
const PAGE_INIT_MARKER = "ytmEnhancerAutoPlayInitialized";

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
  private initializedExistingPage = false;
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
        if (this.mode !== "on") {
          this.reportAutoplayPolicyBlocked(false);
        }
        debug("AutoPlay: runtime mode set", this.mode);
        this.applyRuntimeMode();
        return;
      }

      if (message.type === "set-auto-play-enabled") {
        const nextMode = message.enabled === true ? "on" : "off";
        if (nextMode === this.mode) return;
        this.mode = nextMode;
        if (this.mode !== "on") {
          this.reportAutoplayPolicyBlocked(false);
        }
        debug(
          "AutoPlay: legacy runtime enabled set",
          message.enabled,
          this.mode,
        );
        this.applyRuntimeMode();
      }
    };
  }

  init(): void {
    this.initializedExistingPage = this.markPageInitialized();
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
          if (this.mode !== "on") {
            this.reportAutoplayPolicyBlocked(false);
          }
          debug(
            "AutoPlay: initial mode response",
            response,
            "using",
            this.mode,
          );
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

    debug("AutoPlay: trying startup auto-play");

    if (this.adapter.clickFirstPlayButtonWhenPlayerBarClosed()) {
      debug("AutoPlay: clicked page play button on initial attempt");
      return;
    }

    const video = document.querySelector<HTMLVideoElement>(
      SELECTORS.videoElement,
    );

    if (video) {
      debug("AutoPlay: found video", {
        readyState: video.readyState,
        paused: video.paused,
      });
      this.onVideoFound(video);
    } else {
      debug("AutoPlay: no video yet; observing DOM");
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
    debug("AutoPlay: waiting for canplay", { readyState: video.readyState });
    this.canplayHandler = () => {
      if (this.mode !== "on") return;
      debug("AutoPlay: canplay fired");
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

      debug("AutoPlay: DOM changed while waiting for video");

      if (this.adapter.clickFirstPlayButtonWhenPlayerBarClosed()) {
        debug("AutoPlay: clicked page play button while waiting for video");
        this.stopWaitingForVideo();
        return;
      }

      const video = document.querySelector<HTMLVideoElement>(
        SELECTORS.videoElement,
      );

      if (video) {
        debug("AutoPlay: video appeared", {
          readyState: video.readyState,
          paused: video.paused,
        });
        this.stopWaitingForVideo();
        this.onVideoFound(video);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.timeoutId = setTimeout(() => {
      debug("AutoPlay: timed out waiting for video/page play button");
      this.observer?.disconnect();
      this.observer = null;
      this.timeoutId = null;
    }, TIMEOUT_MS);
  }

  private stopWaitingForVideo(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private performAutoPlay(video: HTMLVideoElement): void {
    if (this.mode !== "on") return;

    const state = this.adapter.getPlaybackState();
    debug("AutoPlay: performing auto-play", {
      isPlaying: state.isPlaying,
      title: state.title,
      readyState: video.readyState,
      paused: video.paused,
    });

    if (state.isPlaying) return;

    if (state.title !== null) {
      this.playVideoOrUsePlayerButton(video);
      return;
    }

    // No track loaded -- start from the page surface before falling back.
    const clicked =
      this.adapter.clickFirstPlayButtonWhenPlayerBarClosed() ||
      this.adapter.clickQuickPicksPlayAll();
    if (!clicked) {
      debug("AutoPlay: falling back to video.play()");
      this.playVideoOrUsePlayerButton(video);
    }
  }

  private playVideoOrUsePlayerButton(video: HTMLVideoElement): void {
    void video
      .play()
      .then(() => {
        this.reportAutoplayPolicyBlocked(false);
      })
      .catch((error: unknown) => {
        const name = error instanceof DOMException ? error.name : undefined;
        const message = error instanceof Error ? error.message : String(error);
        debug("AutoPlay: video.play() failed", {
          name,
          message,
        });

        if (name === "NotAllowedError") {
          this.reportAutoplayPolicyBlocked(true);
          debug(
            "AutoPlay: browser blocked audible autoplay; allow autoplay for music.youtube.com in Firefox site permissions",
          );
          return;
        }

        debug(
          "AutoPlay: clicking player play button after video.play() failure",
          {
            name: error instanceof DOMException ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
          },
        );

        if (this.mode !== "on") return;

        const state = this.adapter.getPlaybackState();
        if (!state.isPlaying) {
          this.adapter.executeAction("play");
        }
      });
  }

  private reportAutoplayPolicyBlocked(blocked: boolean): void {
    try {
      chrome.runtime.sendMessage({
        type: "set-auto-play-policy-blocked",
        blocked,
      });
    } catch {
      // Extension may have been reloaded and invalidated this content context.
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

  private shouldTriggerInitialAutoPlay(): boolean {
    if (this.initializedExistingPage) return false;
    return performance.now() <= INITIAL_SUPPRESSION_MAX_AGE_MS;
  }

  private markPageInitialized(): boolean {
    const root = document.documentElement;
    const alreadyInitialized = root.dataset[PAGE_INIT_MARKER] === "true";
    root.dataset[PAGE_INIT_MARKER] = "true";
    return alreadyInitialized;
  }

  private applyInitialMode(): void {
    debug("AutoPlay: applying initial mode", this.mode);
    if (this.mode === "on") {
      this.cancelInitialSuppression();
      if (!this.shouldTriggerInitialAutoPlay()) {
        debug("AutoPlay: skipping startup auto-play on late injection", {
          ageMs: performance.now(),
          initializedExistingPage: this.initializedExistingPage,
        });
        return;
      }
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
    debug("AutoPlay: applying runtime mode", this.mode);
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

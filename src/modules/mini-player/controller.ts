import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import type { PlaybackAction } from "@/core/types";
import type { VisualizerOverlayManager } from "@/modules/audio-visualizer/overlay-manager";
import { PipButton } from "./pip-button";
import { PipWindowRenderer } from "./renderer";
import { VideoPipFallback } from "./video-fallback";
import { debug } from "@/core/logger";
import {
  createDocumentPipClient,
  type DocumentPipClient,
} from "@/core/document-pip";
import { createRuntimeClient, type RuntimeClient } from "@/core/messaging";

const POLL_INTERVAL_MS = 1000;
const DELAYED_REFRESH_MS = 150;
const DOCUMENT_PIP_WIDTH = 480;
const DOCUMENT_PIP_HEIGHT = 180;
const MEDIA_REFRESH_EVENTS = [
  "play",
  "pause",
  "timeupdate",
  "durationchange",
  "loadedmetadata",
  "volumechange",
  "ratechange",
  "seeked",
] as const;

interface MediaRefreshListener {
  target: HTMLMediaElement;
  type: (typeof MEDIA_REFRESH_EVENTS)[number];
  listener: EventListener;
}

export class MiniPlayerController {
  private adapter = new YTMAdapter();
  private pipButton = new PipButton(() => this.handlePipClick());
  private renderer = new PipWindowRenderer();
  private videoFallback = new VideoPipFallback((open) => {
    this.reportPipOpenState(open);
  });
  private overlayManager: VisualizerOverlayManager | null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private delayedRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private mediaRefreshListeners: MediaRefreshListener[] = [];
  private observer: MutationObserver | null = null;
  private enabled = false;
  private documentPipOpen = false;
  private runtime: RuntimeClient;
  private documentPip: DocumentPipClient;
  private unsubscribeRuntime: (() => void) | null = null;
  private messageListener: (message: { type: string; data?: unknown }) => void;

  constructor(
    overlayManager?: VisualizerOverlayManager,
    runtime: RuntimeClient = createRuntimeClient(),
    documentPip: DocumentPipClient = createDocumentPipClient(),
  ) {
    this.overlayManager = overlayManager ?? null;
    this.runtime = runtime;
    this.documentPip = documentPip;
    this.messageListener = (message) => {
      if (message.type !== "set-mini-player-enabled") return;
      const newEnabled = message.data === true;
      if (newEnabled === this.enabled) return;

      this.enabled = newEnabled;
      if (newEnabled && this.documentPip.isSupported()) {
        this.tryInjectButton();
      } else {
        this.pipButton.remove();
        this.observer?.disconnect();
        this.observer = null;
      }
    };
  }

  async init(): Promise<void> {
    this.unsubscribeRuntime = this.runtime.subscribe(this.messageListener);
    this.enabled = await this.queryEnabled();
    if (!this.enabled || !this.documentPip.isSupported()) return;

    this.tryInjectButton();
  }

  destroy(): void {
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = null;
    this.pipButton.remove();
    this.stopPolling();
    this.clearDelayedRefresh();
    this.detachMediaRefreshListeners();
    this.observer?.disconnect();
    this.observer = null;
    this.documentPipOpen = false;
    this.reportPipOpenState(false);
  }

  isPipOpen(): boolean {
    return this.documentPipOpen || this.videoFallback.isOpen();
  }

  private async queryEnabled(): Promise<boolean> {
    return this.runtime
      .request<boolean>({ type: "get-mini-player-enabled" })
      .then((enabled) => enabled === true)
      .catch(() => false);
  }

  private tryInjectButton(): void {
    const nativeButton = document.querySelector(
      SELECTORS.nativeMiniPlayerButton,
    ) as HTMLElement | null;

    if (nativeButton) {
      this.pipButton.attach(nativeButton);
    } else {
      this.waitForNativeButton();
    }
  }

  private waitForNativeButton(): void {
    this.observer = new MutationObserver(() => {
      const nativeButton = document.querySelector(
        SELECTORS.nativeMiniPlayerButton,
      ) as HTMLElement | null;

      if (nativeButton) {
        this.observer?.disconnect();
        this.observer = null;
        this.pipButton.attach(nativeButton);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private handlePipClick(): void {
    void this.openPreferredPip();
  }

  private async openPreferredPip(): Promise<void> {
    // In Song mode, prefer Document PiP to avoid switching to the video track.
    // In Video mode, prefer native video PiP for compact native UX.
    if (this.adapter.isVideoMode()) {
      if (await this.videoFallback.open()) return;
      await this.openDocumentPip();
      return;
    }

    if (await this.openDocumentPip()) return;
    await this.videoFallback.open();
  }

  private async openDocumentPip(): Promise<boolean> {
    if (!this.documentPip.isSupported()) return false;

    try {
      const pipWindow = await this.documentPip.requestWindow({
        width: DOCUMENT_PIP_WIDTH,
        height: DOCUMENT_PIP_HEIGHT,
      });

      const state = this.adapter.getPlaybackState();
      const pipDoc = pipWindow.document;

      this.renderer.build(
        pipDoc,
        state,
        (action: PlaybackAction) => {
          this.handlePipAction(action);
        },
        (time: number) => {
          this.handlePipSeek(time);
        },
        {
          onLike: () => this.handlePipLike(),
          onDislike: () => this.handlePipDislike(),
          onVolumeChange: (volume: number) =>
            this.handlePipVolumeChange(volume),
          volume: this.adapter.getVolume(),
          isLiked: this.adapter.isCurrentTrackLiked(),
          isDisliked: this.adapter.isCurrentTrackDisliked(),
        },
      );

      const artworkContainer = this.renderer.getArtworkContainer();
      if (artworkContainer && this.overlayManager) {
        this.overlayManager.attachToPip(artworkContainer);
      }

      this.documentPipOpen = true;
      this.attachMediaRefreshListeners();
      this.startPolling();
      this.reportPipOpenState(true);
      debug("PiP: document PiP opened");

      pipWindow.addEventListener("pagehide", () => {
        this.stopPolling();
        this.clearDelayedRefresh();
        this.detachMediaRefreshListeners();
        this.overlayManager?.detachPip();
        this.documentPipOpen = false;
        this.reportPipOpenState(false);
        debug("PiP: document PiP closed");
      });

      return true;
    } catch {
      return false;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.refreshPipState();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private handlePipAction(action: PlaybackAction): void {
    void this.runPipMutation(() =>
      this.runtime.command({ type: "playback-action", action }),
    );
  }

  private handlePipSeek(time: number): void {
    this.adapter.seekTo(time);
    this.refreshAfterPipMutation();
  }

  private handlePipLike(): void {
    this.adapter.toggleLike();
    this.refreshAfterPipMutation();
  }

  private handlePipDislike(): void {
    this.adapter.toggleDislike();
    this.refreshAfterPipMutation();
  }

  private handlePipVolumeChange(volume: number): void {
    this.adapter.setVolume(volume);
    this.refreshAfterPipMutation();
  }

  private async runPipMutation(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch {
      // The next poll will re-sync the PiP window if the runtime route fails.
    } finally {
      this.refreshAfterPipMutation();
    }
  }

  private refreshAfterPipMutation(): void {
    this.refreshPipState();
    this.scheduleDelayedRefresh();
  }

  private scheduleDelayedRefresh(): void {
    this.clearDelayedRefresh();
    this.delayedRefreshTimer = setTimeout(() => {
      this.delayedRefreshTimer = null;
      this.refreshPipState();
    }, DELAYED_REFRESH_MS);
  }

  private clearDelayedRefresh(): void {
    if (this.delayedRefreshTimer !== null) {
      clearTimeout(this.delayedRefreshTimer);
      this.delayedRefreshTimer = null;
    }
  }

  private refreshPipState(): void {
    if (!this.documentPipOpen) return;

    const state = this.adapter.getPlaybackState();
    this.renderer.update(state);
    this.renderer.updateAuxState(
      this.adapter.getVolume(),
      this.adapter.isCurrentTrackLiked(),
      this.adapter.isCurrentTrackDisliked(),
    );
  }

  private attachMediaRefreshListeners(): void {
    this.detachMediaRefreshListeners();

    const media = document.querySelector<HTMLMediaElement>(
      SELECTORS.videoElement,
    );
    if (!media) return;

    const listener: EventListener = () => {
      this.refreshPipState();
    };

    for (const type of MEDIA_REFRESH_EVENTS) {
      media.addEventListener(type, listener);
      this.mediaRefreshListeners.push({ target: media, type, listener });
    }
  }

  private detachMediaRefreshListeners(): void {
    for (const { target, type, listener } of this.mediaRefreshListeners) {
      target.removeEventListener(type, listener);
    }
    this.mediaRefreshListeners = [];
  }

  private reportPipOpenState(open: boolean): void {
    void this.runtime
      .command({ type: "pip-open-state", open })
      .catch(() => undefined);
  }
}

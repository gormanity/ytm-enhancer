import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import type { PlaybackAction } from "@/core/types";
import type { PlaybackState } from "@/core/types";
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
import {
  createPlaybackController,
  type PlaybackController,
} from "@/core/playback-controller";

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

export class MiniPlayerController {
  private adapter = new YTMAdapter();
  private pipButton = new PipButton(() => this.handlePipClick());
  private renderer = new PipWindowRenderer();
  private videoFallback = new VideoPipFallback((open) => {
    this.reportPipOpenState(open);
  });
  private overlayManager: VisualizerOverlayManager | null;
  private playbackController: PlaybackController | null = null;
  private unsubscribePlayback: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private enabled = false;
  private documentPipOpen = false;
  private runtime: RuntimeClient;
  private documentPip: DocumentPipClient;
  private unsubscribeRuntime: (() => void) | null = null;
  private messageListener: (message: { type: string; data?: unknown }) => void;
  private pipActionSequence = 0;

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
    this.stopPlaybackController();
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
      this.startPlaybackController();
      this.reportPipOpenState(true);
      debug("PiP: document PiP opened");

      pipWindow.addEventListener("pagehide", () => {
        this.stopPlaybackController();
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

  private handlePipAction(action: PlaybackAction): void {
    void this.playbackController?.executeAction(action).catch(() => undefined);
  }

  private handlePipSeek(time: number): void {
    if (this.playbackController) {
      void this.playbackController.seekTo(time);
      return;
    }
    this.adapter.seekTo(time);
  }

  private handlePipLike(): void {
    this.adapter.toggleLike();
    this.playbackController?.refreshAfterMutation();
  }

  private handlePipDislike(): void {
    this.adapter.toggleDislike();
    this.playbackController?.refreshAfterMutation();
  }

  private handlePipVolumeChange(volume: number): void {
    this.adapter.setVolume(volume);
    this.playbackController?.refreshAfterMutation();
  }

  private createPipTraceId(action: string): string {
    this.pipActionSequence += 1;
    return `pip-${Date.now()}-${this.pipActionSequence}-${action}`;
  }

  private renderPipState(state: PlaybackState): void {
    if (!this.documentPipOpen) return;
    this.renderer.update(state);
    this.renderer.updateAuxState(
      this.adapter.getVolume(),
      this.adapter.isCurrentTrackLiked(),
      this.adapter.isCurrentTrackDisliked(),
    );
  }

  private startPlaybackController(): void {
    this.stopPlaybackController();

    const playbackController = createPlaybackController(
      {
        getPlaybackState: () => this.adapter.getPlaybackState(),
        executePlaybackAction: (action) =>
          this.executePipPlaybackAction(action),
        seekTo: (time) => this.adapter.seekTo(time),
        subscribeToStateChanges: (listener) =>
          this.subscribeToMediaRefreshEvents(listener),
      },
      {
        pollIntervalMs: POLL_INTERVAL_MS,
        delayedRefreshMs: DELAYED_REFRESH_MS,
      },
    );
    this.playbackController = playbackController;
    this.unsubscribePlayback = playbackController.subscribe((snapshot) => {
      if (snapshot.ok) this.renderPipState(snapshot.data);
    });
    playbackController.start();
  }

  private stopPlaybackController(): void {
    this.unsubscribePlayback?.();
    this.unsubscribePlayback = null;
    this.playbackController?.destroy();
    this.playbackController = null;
  }

  private async executePipPlaybackAction(
    action: PlaybackAction,
  ): Promise<void> {
    const traceId = this.createPipTraceId(action);
    const startedAt = performance.now();

    try {
      await this.runtime.command({
        type: "playback-action",
        action,
        source: "mini-player-pip",
        traceId,
      });
    } catch (err) {
      debug("PiP: action command failed", {
        traceId,
        label: action,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private subscribeToMediaRefreshEvents(listener: () => void): () => void {
    const media = document.querySelector<HTMLMediaElement>(
      SELECTORS.videoElement,
    );
    if (!media) return () => undefined;

    for (const type of MEDIA_REFRESH_EVENTS) {
      media.addEventListener(type, listener);
    }

    return () => {
      for (const type of MEDIA_REFRESH_EVENTS) {
        media.removeEventListener(type, listener);
      }
    };
  }

  private reportPipOpenState(open: boolean): void {
    void this.runtime
      .command({ type: "pip-open-state", open })
      .catch(() => undefined);
  }
}

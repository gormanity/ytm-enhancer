import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import type { PlaybackAction } from "@/core/types";
import type { VisualizerOverlayManager } from "@/modules/audio-visualizer/overlay-manager";
import { PipButton } from "./pip-button";
import { PipWindowRenderer } from "./renderer";
import { VideoPipFallback } from "./video-fallback";
import { debug } from "@/core/logger";

const POLL_INTERVAL_MS = 1000;
const DOCUMENT_PIP_WIDTH = 480;
const DOCUMENT_PIP_HEIGHT = 180;

export class MiniPlayerController {
  private adapter = new YTMAdapter();
  private pipButton = new PipButton(() => this.handlePipClick());
  private renderer = new PipWindowRenderer();
  private videoFallback = new VideoPipFallback((open) => {
    this.reportPipOpenState(open);
  });
  private overlayManager: VisualizerOverlayManager | null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private observer: MutationObserver | null = null;
  private enabled = false;
  private messageListener: (message: { type: string; data?: unknown }) => void;

  constructor(overlayManager?: VisualizerOverlayManager) {
    this.overlayManager = overlayManager ?? null;
    this.messageListener = (message) => {
      if (message.type !== "set-mini-player-enabled") return;
      const newEnabled = message.data === true;
      if (newEnabled === this.enabled) return;

      this.enabled = newEnabled;
      if (newEnabled) {
        this.tryInjectButton();
      } else {
        this.pipButton.remove();
        this.observer?.disconnect();
        this.observer = null;
      }
    };
  }

  async init(): Promise<void> {
    chrome.runtime.onMessage.addListener(this.messageListener);
    this.enabled = await this.queryEnabled();
    if (!this.enabled) return;

    this.tryInjectButton();
  }

  destroy(): void {
    chrome.runtime.onMessage.removeListener(this.messageListener);
    this.pipButton.remove();
    this.stopPolling();
    this.observer?.disconnect();
    this.observer = null;
    this.reportPipOpenState(false);
  }

  private async queryEnabled(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.sendRuntimeMessage(
          { type: "get-mini-player-enabled" },
          (response: { ok?: boolean; data?: boolean }) => {
            if (chrome.runtime.lastError || !response?.ok) {
              resolve(false);
              return;
            }
            resolve(response.data === true);
          },
        );
      } catch {
        resolve(false);
      }
    });
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
    if (typeof documentPictureInPicture === "undefined") return false;

    try {
      const pipWindow = await documentPictureInPicture.requestWindow({
        width: DOCUMENT_PIP_WIDTH,
        height: DOCUMENT_PIP_HEIGHT,
      });

      const state = this.adapter.getPlaybackState();
      const pipDoc = pipWindow.document;

      this.renderer.build(
        pipDoc,
        state,
        (action: PlaybackAction) => {
          this.adapter.executeAction(action);
        },
        (time: number) => {
          this.adapter.seekTo(time);
        },
        {
          onLike: () => this.adapter.toggleLike(),
          onDislike: () => this.adapter.toggleDislike(),
          onVolumeChange: (volume: number) => this.adapter.setVolume(volume),
          volume: this.adapter.getVolume(),
          isLiked: this.adapter.isCurrentTrackLiked(),
          isDisliked: this.adapter.isCurrentTrackDisliked(),
        },
      );

      const artworkContainer = this.renderer.getArtworkContainer();
      if (artworkContainer && this.overlayManager) {
        this.overlayManager.attachToPip(artworkContainer);
      }

      this.startPolling();
      this.reportPipOpenState(true);
      debug("PiP: document PiP opened");

      pipWindow.addEventListener("pagehide", () => {
        this.stopPolling();
        this.overlayManager?.detachPip();
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
      const state = this.adapter.getPlaybackState();
      this.renderer.update(state);
      this.renderer.updateAuxState(
        this.adapter.getVolume(),
        this.adapter.isCurrentTrackLiked(),
        this.adapter.isCurrentTrackDisliked(),
      );
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private sendRuntimeMessage<TResponse = unknown>(
    message: unknown,
    callback?: (response: TResponse) => void,
  ): void {
    if (!chrome.runtime?.id) {
      callback?.({ ok: false } as TResponse);
      return;
    }

    try {
      if (callback) {
        chrome.runtime.sendMessage(message, callback);
      } else {
        chrome.runtime.sendMessage(message);
      }
    } catch {
      callback?.({ ok: false } as TResponse);
    }
  }

  private reportPipOpenState(open: boolean): void {
    this.sendRuntimeMessage({ type: "pip-open-state", open });
  }
}

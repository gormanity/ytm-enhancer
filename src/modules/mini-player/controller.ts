import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import type { PlaybackAction } from "@/core/types";
import type { VisualizerOverlayManager } from "@/modules/audio-visualizer/overlay-manager";
import { PipButton } from "./pip-button";
import { PipWindowRenderer } from "./renderer";
import { VideoPipFallback } from "./video-fallback";

const POLL_INTERVAL_MS = 1000;

export class MiniPlayerController {
  private adapter = new YTMAdapter();
  private pipButton = new PipButton(() => this.handlePipClick());
  private renderer = new PipWindowRenderer();
  private videoFallback = new VideoPipFallback();
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
  }

  private async queryEnabled(): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "get-mini-player-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          resolve(response?.ok === true && response.data === true);
        },
      );
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
    if (typeof documentPictureInPicture !== "undefined") {
      void this.openDocumentPip();
    } else {
      void this.videoFallback.open();
    }
  }

  private async openDocumentPip(): Promise<void> {
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: 320,
      height: 400,
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
    );

    const artworkContainer = this.renderer.getArtworkContainer();
    if (artworkContainer && this.overlayManager) {
      this.overlayManager.attachToPip(artworkContainer);
    }

    this.startPolling();

    pipWindow.addEventListener("pagehide", () => {
      this.stopPolling();
      this.overlayManager?.detachPip();
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      const state = this.adapter.getPlaybackState();
      this.renderer.update(state);
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

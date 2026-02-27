import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import type { PlaybackAction } from "@/core/types";
import { PipButton } from "./pip-button";
import { PipWindowRenderer } from "./renderer";
import { VideoPipFallback } from "./video-fallback";

const POLL_INTERVAL_MS = 1000;

export class MiniPlayerController {
  private adapter = new YTMAdapter();
  private pipButton = new PipButton(() => this.handlePipClick());
  private renderer = new PipWindowRenderer();
  private videoFallback = new VideoPipFallback();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private observer: MutationObserver | null = null;
  private enabled = false;

  async init(): Promise<void> {
    this.enabled = await this.queryEnabled();
    if (!this.enabled) return;

    this.tryInjectButton();
  }

  destroy(): void {
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
    const container = document.querySelector(
      SELECTORS.playerBarRightControls,
    ) as HTMLElement | null;

    if (container) {
      this.pipButton.inject(container);
    } else {
      this.waitForPlayerBar();
    }
  }

  private waitForPlayerBar(): void {
    this.observer = new MutationObserver(() => {
      const container = document.querySelector(
        SELECTORS.playerBarRightControls,
      ) as HTMLElement | null;

      if (container) {
        this.observer?.disconnect();
        this.observer = null;
        this.pipButton.inject(container);
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

    this.renderer.build(pipDoc, state, (action: PlaybackAction) => {
      this.adapter.executeAction(action);
    });

    this.startPolling();

    pipWindow.addEventListener("pagehide", () => {
      this.stopPolling();
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

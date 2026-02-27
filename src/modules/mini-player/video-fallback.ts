import { SELECTORS } from "@/adapter/selectors";

export class VideoPipFallback {
  private open_ = false;

  isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<void> {
    const video = document.querySelector(
      SELECTORS.videoElement,
    ) as HTMLVideoElement | null;
    if (!video) return;

    try {
      await video.requestPictureInPicture();
      this.open_ = true;
    } catch {
      // PiP may be unavailable or denied by the browser.
    }
  }

  async close(): Promise<void> {
    try {
      await document.exitPictureInPicture();
    } catch {
      // Already closed or not supported.
    }
    this.open_ = false;
  }
}

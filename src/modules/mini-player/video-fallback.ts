import { SELECTORS } from "@/adapter/selectors";

export class VideoPipFallback {
  private open_ = false;

  isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<boolean> {
    const video = document.querySelector(
      SELECTORS.videoElement,
    ) as HTMLVideoElement | null;
    if (!video) return false;

    try {
      await video.requestPictureInPicture();
      this.open_ = true;
      return true;
    } catch {
      // PiP may be unavailable or denied by the browser.
      return false;
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

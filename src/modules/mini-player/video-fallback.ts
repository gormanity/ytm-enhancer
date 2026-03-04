import { SELECTORS } from "@/adapter/selectors";

export class VideoPipFallback {
  private open_ = false;
  private activeVideo: HTMLVideoElement | null = null;
  private leaveHandler: (() => void) | null = null;

  constructor(private readonly onOpenChange?: (open: boolean) => void) {}

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
      this.cleanupVideoListener();
      this.activeVideo = video;
      this.leaveHandler = () => {
        this.open_ = false;
        this.onOpenChange?.(false);
        this.cleanupVideoListener();
      };
      video.addEventListener("leavepictureinpicture", this.leaveHandler, {
        once: true,
      });
      this.open_ = true;
      this.onOpenChange?.(true);
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
    this.onOpenChange?.(false);
    this.cleanupVideoListener();
  }

  private cleanupVideoListener(): void {
    if (this.activeVideo && this.leaveHandler) {
      this.activeVideo.removeEventListener(
        "leavepictureinpicture",
        this.leaveHandler,
      );
    }
    this.activeVideo = null;
    this.leaveHandler = null;
  }
}

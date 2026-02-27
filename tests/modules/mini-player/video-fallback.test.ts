import { describe, it, expect, vi, beforeEach } from "vitest";
import { VideoPipFallback } from "@/modules/mini-player/video-fallback";
import { SELECTORS } from "@/adapter/selectors";

describe("VideoPipFallback", () => {
  let fallback: VideoPipFallback;

  beforeEach(() => {
    fallback = new VideoPipFallback();
  });

  it("should not be open initially", () => {
    expect(fallback.isOpen()).toBe(false);
  });

  it("should open PiP on the video element", async () => {
    const requestPiP = vi.fn().mockResolvedValue({});
    const video = document.createElement("video");
    video.className = "html5-main-video";
    video.requestPictureInPicture = requestPiP;
    document.body.appendChild(video);

    // Make the video match the selector
    const original = document.querySelector.bind(document);
    vi.spyOn(document, "querySelector").mockImplementation((sel: string) => {
      if (sel === SELECTORS.videoElement) return video;
      return original(sel);
    });

    await fallback.open();

    expect(requestPiP).toHaveBeenCalled();
    expect(fallback.isOpen()).toBe(true);

    document.body.removeChild(video);
  });

  it("should not throw if no video element is found", async () => {
    vi.spyOn(document, "querySelector").mockReturnValue(null);

    await expect(fallback.open()).resolves.not.toThrow();
    expect(fallback.isOpen()).toBe(false);
  });

  it("should close PiP", async () => {
    const exitMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "exitPictureInPicture", {
      value: exitMock,
      writable: true,
      configurable: true,
    });

    // Simulate open state
    const requestPiP = vi.fn().mockResolvedValue({});
    const video = document.createElement("video");
    video.requestPictureInPicture = requestPiP;
    vi.spyOn(document, "querySelector").mockReturnValue(video);

    await fallback.open();
    await fallback.close();

    expect(exitMock).toHaveBeenCalled();
    expect(fallback.isOpen()).toBe(false);
  });

  it("should not throw when closing without opening", async () => {
    Object.defineProperty(document, "exitPictureInPicture", {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    });

    await expect(fallback.close()).resolves.not.toThrow();
  });
});

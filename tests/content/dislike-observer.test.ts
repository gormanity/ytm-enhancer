import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DislikeObserver } from "@/content/dislike-observer";

/** Flush pending MutationObserver callbacks. */
async function flush(): Promise<void> {
  await vi.waitFor(() => {}, { timeout: 50 });
}

function createRenderer(likeStatus: string): HTMLElement {
  const renderer = document.createElement("ytmusic-like-button-renderer");
  renderer.id = "like-button-renderer";
  renderer.setAttribute("like-status", likeStatus);
  document.body.appendChild(renderer);
  return renderer;
}

describe("DislikeObserver", () => {
  let onDislikeChange: ReturnType<typeof vi.fn<(isDisliked: boolean) => void>>;
  let observer: DislikeObserver;

  beforeEach(() => {
    onDislikeChange = vi.fn<(isDisliked: boolean) => void>();
    observer = new DislikeObserver(onDislikeChange);
  });

  afterEach(() => {
    observer.stop();
    document.body.innerHTML = "";
  });

  it("should fire callback when like-status changes to DISLIKE", async () => {
    const renderer = createRenderer("INDIFFERENT");

    observer.start();
    renderer.setAttribute("like-status", "DISLIKE");
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(true);
  });

  it("should fire callback when like-status changes to INDIFFERENT", async () => {
    const renderer = createRenderer("DISLIKE");

    observer.start();
    renderer.setAttribute("like-status", "INDIFFERENT");
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(false);
  });

  it("should not fire callback when other attributes change", async () => {
    const renderer = createRenderer("INDIFFERENT");

    observer.start();
    renderer.setAttribute("data-test", "value");
    await flush();

    expect(onDislikeChange).not.toHaveBeenCalled();
  });

  it("should discover renderer added after start()", async () => {
    observer.start();
    await flush();

    const renderer = createRenderer("INDIFFERENT");
    await flush();

    renderer.setAttribute("like-status", "DISLIKE");
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(true);
  });

  it("should stop observing when stop() is called", async () => {
    const renderer = createRenderer("INDIFFERENT");

    observer.start();
    observer.stop();

    renderer.setAttribute("like-status", "DISLIKE");
    await flush();

    expect(onDislikeChange).not.toHaveBeenCalled();
  });

  it("should stop discovery observer on stop()", async () => {
    observer.start();
    observer.stop();

    const renderer = createRenderer("INDIFFERENT");
    await flush();

    renderer.setAttribute("like-status", "DISLIKE");
    await flush();

    expect(onDislikeChange).not.toHaveBeenCalled();
  });

  it("should re-observe renderer on reobserve()", async () => {
    const renderer = createRenderer("INDIFFERENT");
    observer.start();

    observer.reobserve();
    renderer.setAttribute("like-status", "DISLIKE");
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(true);
  });

  it("should check initial state on reobserve()", async () => {
    createRenderer("INDIFFERENT");
    observer.start();

    // Replace with a renderer that is already disliked (simulates
    // navigating to a previously disliked track)
    document.body.innerHTML = "";
    createRenderer("DISLIKE");

    observer.reobserve();
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(true);
  });

  it("should report not-disliked on reobserve() for INDIFFERENT track", async () => {
    createRenderer("DISLIKE");
    observer.start();

    document.body.innerHTML = "";
    createRenderer("INDIFFERENT");

    observer.reobserve();
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(false);
  });
});

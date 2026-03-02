import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DislikeObserver } from "@/content/dislike-observer";

/** Flush pending MutationObserver callbacks. */
async function flush(): Promise<void> {
  await vi.waitFor(() => {}, { timeout: 50 });
}

function createDislikeButton(pressed: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.setAttribute("aria-label", "Dislike");
  btn.setAttribute("aria-pressed", pressed);
  document.body.appendChild(btn);
  return btn;
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

  it("should fire callback when aria-pressed changes to true", async () => {
    const btn = createDislikeButton("false");

    observer.start();
    btn.setAttribute("aria-pressed", "true");
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(true);
  });

  it("should fire callback when aria-pressed changes to false", async () => {
    const btn = createDislikeButton("true");

    observer.start();
    btn.setAttribute("aria-pressed", "false");
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(false);
  });

  it("should not fire callback when other attributes change", async () => {
    const btn = createDislikeButton("false");

    observer.start();
    btn.setAttribute("data-test", "value");
    await flush();

    expect(onDislikeChange).not.toHaveBeenCalled();
  });

  it("should discover button added after start()", async () => {
    observer.start();
    await flush();

    // Button doesn't exist yet — add it
    const btn = createDislikeButton("false");
    await flush();

    // Now mutate the attribute
    btn.setAttribute("aria-pressed", "true");
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(true);
  });

  it("should stop observing when stop() is called", async () => {
    const btn = createDislikeButton("false");

    observer.start();
    observer.stop();

    btn.setAttribute("aria-pressed", "true");
    await flush();

    expect(onDislikeChange).not.toHaveBeenCalled();
  });

  it("should stop discovery observer on stop()", async () => {
    observer.start();
    observer.stop();

    const btn = createDislikeButton("false");
    await flush();

    btn.setAttribute("aria-pressed", "true");
    await flush();

    expect(onDislikeChange).not.toHaveBeenCalled();
  });

  it("should re-observe button on reobserve()", async () => {
    const btn = createDislikeButton("false");
    observer.start();

    // Remove old button, add new one (simulates track change)
    btn.remove();
    const newBtn = createDislikeButton("false");

    observer.reobserve();
    newBtn.setAttribute("aria-pressed", "true");
    await flush();

    expect(onDislikeChange).toHaveBeenCalledWith(true);
  });

  it("should not fire callback immediately on reobserve()", async () => {
    createDislikeButton("false");
    observer.start();

    // Replace with a button that is already disliked
    document.body.innerHTML = "";
    createDislikeButton("true");

    observer.reobserve();
    await flush();

    // Should NOT fire for the current state — only for future changes.
    // Firing immediately causes a runaway skip loop when the previous
    // track's dislike state hasn't cleared yet.
    expect(onDislikeChange).not.toHaveBeenCalled();
  });
});

import { SELECTORS } from "@/adapter/selectors";

export type DislikeChangeSource = "initial" | "change";

export function shouldAutoSkipDislikedChange(
  enabled: boolean,
  isDisliked: boolean,
  source: DislikeChangeSource,
): boolean {
  return enabled && isDisliked && source === "initial";
}

export class DislikeObserver {
  private rendererObserver: MutationObserver | null = null;
  private discoveryObserver: MutationObserver | null = null;
  private onDislikeChange: (
    isDisliked: boolean,
    source: DislikeChangeSource,
  ) => void;

  constructor(
    onDislikeChange: (isDisliked: boolean, source: DislikeChangeSource) => void,
  ) {
    this.onDislikeChange = onDislikeChange;
  }

  start(): void {
    const renderer = document.querySelector(SELECTORS.likeButtonRenderer);
    if (renderer) {
      this.observeRenderer(renderer);
    } else {
      this.waitForRenderer();
    }
  }

  stop(): void {
    this.rendererObserver?.disconnect();
    this.rendererObserver = null;
    this.discoveryObserver?.disconnect();
    this.discoveryObserver = null;
  }

  reobserve(): void {
    this.rendererObserver?.disconnect();
    this.rendererObserver = null;

    const renderer = document.querySelector(SELECTORS.likeButtonRenderer);
    if (renderer) {
      this.observeRenderer(renderer);
      // Check initial state for the new track
      const isDisliked = renderer.getAttribute("like-status") === "DISLIKE";
      this.onDislikeChange(isDisliked, "initial");
    }
  }

  private observeRenderer(renderer: Element): void {
    this.rendererObserver = new MutationObserver(() => {
      const isDisliked = renderer.getAttribute("like-status") === "DISLIKE";
      this.onDislikeChange(isDisliked, "change");
    });

    this.rendererObserver.observe(renderer, {
      attributes: true,
      attributeFilter: ["like-status"],
    });
  }

  private waitForRenderer(): void {
    this.discoveryObserver = new MutationObserver(() => {
      const renderer = document.querySelector(SELECTORS.likeButtonRenderer);
      if (renderer) {
        this.discoveryObserver?.disconnect();
        this.discoveryObserver = null;
        this.observeRenderer(renderer);
      }
    });

    this.discoveryObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

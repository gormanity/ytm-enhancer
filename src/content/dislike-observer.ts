import { SELECTORS } from "@/adapter/selectors";

export class DislikeObserver {
  private buttonObserver: MutationObserver | null = null;
  private discoveryObserver: MutationObserver | null = null;
  private onDislikeChange: (isDisliked: boolean) => void;

  constructor(onDislikeChange: (isDisliked: boolean) => void) {
    this.onDislikeChange = onDislikeChange;
  }

  start(): void {
    const btn = document.querySelector(SELECTORS.dislikeButton);
    if (btn) {
      this.observeButton(btn);
    } else {
      this.waitForButton();
    }
  }

  stop(): void {
    this.buttonObserver?.disconnect();
    this.buttonObserver = null;
    this.discoveryObserver?.disconnect();
    this.discoveryObserver = null;
  }

  reobserve(): void {
    this.buttonObserver?.disconnect();
    this.buttonObserver = null;

    const btn = document.querySelector(SELECTORS.dislikeButton);
    if (btn) {
      this.fireCurrentState(btn);
      this.observeButton(btn);
    }
  }

  private observeButton(btn: Element): void {
    this.buttonObserver = new MutationObserver(() => {
      const pressed = btn.getAttribute("aria-pressed") === "true";
      this.onDislikeChange(pressed);
    });

    this.buttonObserver.observe(btn, {
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });
  }

  private waitForButton(): void {
    this.discoveryObserver = new MutationObserver(() => {
      const btn = document.querySelector(SELECTORS.dislikeButton);
      if (btn) {
        this.discoveryObserver?.disconnect();
        this.discoveryObserver = null;
        this.observeButton(btn);
      }
    });

    this.discoveryObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private fireCurrentState(btn: Element): void {
    const pressed = btn.getAttribute("aria-pressed") === "true";
    this.onDislikeChange(pressed);
  }
}

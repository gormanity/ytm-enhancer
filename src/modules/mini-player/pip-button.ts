const PIP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="3" width="20" height="14" rx="2"/>
  <rect x="12" y="9" width="8" height="6" rx="1"/>
</svg>`;

export class PipButton {
  private customButton: HTMLButtonElement | null = null;
  private nativeButton: HTMLElement | null = null;
  private captureHandler: ((e: Event) => void) | null = null;

  constructor(private readonly onClick: () => void) {}

  attach(nativeButton: HTMLElement): void {
    this.captureHandler = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      this.onClick();
    };
    this.nativeButton = nativeButton;
    nativeButton.addEventListener("click", this.captureHandler, true);
  }

  inject(container: HTMLElement | null): void {
    if (!container) return;

    const button = document.createElement("button");
    button.innerHTML = PIP_ICON_SVG;
    button.setAttribute("aria-label", "Open mini player");
    button.className = "ytm-enhancer-pip-button";
    button.addEventListener("click", this.onClick);

    container.appendChild(button);
    this.customButton = button;
  }

  remove(): void {
    if (this.nativeButton && this.captureHandler) {
      this.nativeButton.removeEventListener("click", this.captureHandler, true);
      this.nativeButton = null;
      this.captureHandler = null;
    }
    if (this.customButton) {
      this.customButton.removeEventListener("click", this.onClick);
      this.customButton.remove();
      this.customButton = null;
    }
  }
}

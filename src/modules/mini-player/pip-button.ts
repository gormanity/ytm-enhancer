const PIP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="3" width="20" height="14" rx="2"/>
  <rect x="12" y="9" width="8" height="6" rx="1"/>
</svg>`;

export class PipButton {
  private button: HTMLButtonElement | null = null;

  constructor(private readonly onClick: () => void) {}

  inject(container: HTMLElement | null): void {
    if (!container) return;

    const button = document.createElement("button");
    button.innerHTML = PIP_ICON_SVG;
    button.setAttribute("aria-label", "Open mini player");
    button.className = "ytm-enhancer-pip-button";
    button.addEventListener("click", this.onClick);

    container.appendChild(button);
    this.button = button;
  }

  remove(): void {
    if (this.button) {
      this.button.removeEventListener("click", this.onClick);
      this.button.remove();
      this.button = null;
    }
  }
}

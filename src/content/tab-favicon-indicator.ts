const INDICATOR_ATTRIBUTE = "data-ytm-enhancer-tab-favicon-indicator";
const INDICATOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#ff0000"/>
  <circle cx="32" cy="32" r="17" fill="#ffffff"/>
  <path d="M27 22v20l17-10z" fill="#ff0000"/>
  <circle cx="49" cy="15" r="11" fill="#111827"/>
  <circle cx="49" cy="15" r="6" fill="#2dd4bf"/>
</svg>`;

function indicatorHref(): string {
  return `data:image/svg+xml,${encodeURIComponent(INDICATOR_SVG)}`;
}

export class TabFaviconIndicator {
  private link: HTMLLinkElement | null = null;

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.ensureIndicatorLink();
      return;
    }

    this.removeIndicatorLink();
  }

  destroy(): void {
    this.removeIndicatorLink();
  }

  private ensureIndicatorLink(): void {
    if (this.link?.isConnected) return;

    const existing = document.head.querySelector<HTMLLinkElement>(
      `link[${INDICATOR_ATTRIBUTE}="true"]`,
    );
    if (existing) {
      this.link = existing;
      return;
    }

    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = indicatorHref();
    link.setAttribute(INDICATOR_ATTRIBUTE, "true");
    document.head.appendChild(link);
    this.link = link;
  }

  private removeIndicatorLink(): void {
    const links = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>(
        `link[${INDICATOR_ATTRIBUTE}="true"]`,
      ),
    );

    for (const link of links) {
      link.remove();
    }
    this.link = null;
  }
}

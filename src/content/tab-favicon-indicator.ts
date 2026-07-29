import productIconSvg from "@/assets/icon.svg?raw";

const INDICATOR_ATTRIBUTE = "data-ytm-enhancer-tab-favicon-indicator";
const NATIVE_REL_ATTRIBUTE = "data-ytm-enhancer-tab-favicon-native-rel";

function indicatorHref(): string {
  return `data:image/svg+xml,${encodeURIComponent(productIconSvg)}`;
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
    this.suppressPageFavicons();

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
    link.setAttribute("sizes", "any");
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
    this.restorePageFavicons();
  }

  private suppressPageFavicons(): void {
    const links = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>("link[rel]"),
    ).filter(
      (link) =>
        link.relList.contains("icon") &&
        !link.hasAttribute(INDICATOR_ATTRIBUTE),
    );

    for (const link of links) {
      link.setAttribute(NATIVE_REL_ATTRIBUTE, link.rel);
      link.removeAttribute("rel");
    }
  }

  private restorePageFavicons(): void {
    const links = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>(
        `link[${NATIVE_REL_ATTRIBUTE}]`,
      ),
    );

    for (const link of links) {
      const rel = link.getAttribute(NATIVE_REL_ATTRIBUTE);
      link.removeAttribute(NATIVE_REL_ATTRIBUTE);
      if (rel) {
        link.rel = rel;
      }
    }
  }
}

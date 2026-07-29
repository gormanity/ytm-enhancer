import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TabFaviconIndicator } from "@/content/tab-favicon-indicator";

const PRODUCT_ICON_SVG = readFileSync("src/assets/icon.svg", "utf8");

function indicatorLinks(): HTMLLinkElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(
      'link[data-ytm-enhancer-tab-favicon-indicator="true"]',
    ),
  );
}

function indicatorSvgSource(link: HTMLLinkElement): string {
  const [, encodedSvg] = link.href.split(",", 2);
  return decodeURIComponent(encodedSvg);
}

describe("TabFaviconIndicator", () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<link rel="icon" type="image/x-icon" href="/favicon.ico">';
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("adds an indicator favicon while preserving the page favicon link", () => {
    const indicator = new TabFaviconIndicator();

    indicator.setEnabled(true);

    const original = document.head.querySelector<HTMLLinkElement>(
      'link[href="/favicon.ico"]',
    );
    const [indicatorLink] = indicatorLinks();
    expect(original).not.toBeNull();
    expect(original?.hasAttribute("rel")).toBe(false);
    expect(
      original?.getAttribute("data-ytm-enhancer-tab-favicon-native-rel"),
    ).toBe("icon");
    expect(indicatorLink).toBeDefined();
    expect(indicatorLink.rel).toBe("icon");
    expect(indicatorLink.type).toBe("image/svg+xml");
    expect(indicatorLink.href).toContain("data:image/svg+xml");
    expect(indicatorLink.getAttribute("sizes")).toBe("any");
  });

  it("uses the exact YTM Enhancer product icon", () => {
    const indicator = new TabFaviconIndicator();

    indicator.setEnabled(true);

    const [indicatorLink] = indicatorLinks();
    expect(indicatorSvgSource(indicatorLink)).toBe(PRODUCT_ICON_SVG);
  });

  it("does not duplicate the indicator favicon", () => {
    const indicator = new TabFaviconIndicator();

    indicator.setEnabled(true);
    indicator.setEnabled(true);

    expect(indicatorLinks()).toHaveLength(1);
  });

  it("removes the indicator favicon when disabled or destroyed", () => {
    const indicator = new TabFaviconIndicator();

    indicator.setEnabled(true);
    indicator.setEnabled(false);
    expect(indicatorLinks()).toHaveLength(0);

    indicator.setEnabled(true);
    indicator.destroy();
    expect(indicatorLinks()).toHaveLength(0);
  });

  it("restores the page favicon when disabled", () => {
    const indicator = new TabFaviconIndicator();
    const original = document.head.querySelector<HTMLLinkElement>(
      'link[href="/favicon.ico"]',
    );

    indicator.setEnabled(true);
    expect(original?.hasAttribute("rel")).toBe(false);
    indicator.setEnabled(false);

    const restored = document.head.querySelector<HTMLLinkElement>(
      'link[href="/favicon.ico"]',
    );
    expect(restored).toBe(original);
    expect(restored?.rel).toBe("icon");
    expect(
      restored?.hasAttribute("data-ytm-enhancer-tab-favicon-native-rel"),
    ).toBe(false);
  });
});

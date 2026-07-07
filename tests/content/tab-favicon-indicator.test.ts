import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TabFaviconIndicator } from "@/content/tab-favicon-indicator";

function indicatorLinks(): HTMLLinkElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(
      'link[data-ytm-enhancer-tab-favicon-indicator="true"]',
    ),
  );
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

  it("adds an indicator favicon without removing the page favicon", () => {
    const indicator = new TabFaviconIndicator();

    indicator.setEnabled(true);

    const original = document.head.querySelector<HTMLLinkElement>(
      'link[href="/favicon.ico"]',
    );
    const [indicatorLink] = indicatorLinks();
    expect(original).not.toBeNull();
    expect(indicatorLink).toBeDefined();
    expect(indicatorLink.rel).toBe("icon");
    expect(indicatorLink.type).toBe("image/svg+xml");
    expect(indicatorLink.href).toContain("data:image/svg+xml");
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
});

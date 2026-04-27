import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAboutPopupView } from "@/modules/about/popup";

describe("createAboutPopupView", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        getManifest: () => ({ version: "9.9.9" }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return a popup view with correct metadata", () => {
    const view = createAboutPopupView();
    expect(view.id).toBe("about");
    expect(view.label).toBe("About");
  });

  it("should render the expected static sections", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    expect(container.querySelector("h2")?.textContent).toBe("About");
    expect(container.textContent).toContain("YTM Enhancer");
    expect(container.textContent).toContain("Resources");
    expect(container.textContent).toContain("Extension Stores");
    expect(container.querySelectorAll("a.about-link-row")).toHaveLength(5);
  });

  it("should display the extension version from the manifest", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const versionEl = container.querySelector<HTMLElement>(
      '[data-role="about-version"]',
    );
    expect(versionEl?.textContent).toBe("v9.9.9");
  });

  it("should link to the published extension stores", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const hrefs = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a.about-link-row"),
    ).map((a) => a.href);

    expect(hrefs).toContain(
      "https://chromewebstore.google.com/detail/ytm-enhancer/bilcedjabgiedoamakekncokccabdccp",
    );
    expect(hrefs).toContain(
      "https://addons.mozilla.org/en-US/firefox/addon/ytm-enhancer/",
    );
    expect(hrefs).toContain(
      "https://microsoftedge.microsoft.com/addons/detail/ytm-enhancer/gamefnibdabclmkngggcjghpbhjmajkm",
    );
  });
});

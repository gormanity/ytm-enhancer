import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAboutPopupView } from "@/modules/about/popup";

describe("createAboutPopupView", () => {
  const storage: Record<string, unknown> = {};

  beforeEach(() => {
    for (const key of Object.keys(storage)) delete storage[key];
    vi.stubGlobal("chrome", {
      runtime: {
        getManifest: () => ({ version: "9.9.9" }),
      },
      storage: {
        local: {
          get: vi.fn((keys: string[], callback) => {
            callback(
              Object.fromEntries(keys.map((key) => [key, storage[key]])),
            );
          }),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(storage, items);
          }),
        },
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
    expect(container.textContent).toContain("Enjoying YTM Enhancer?");
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

  it("should link the review prompt to the Chrome Web Store by default", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const reviewLink = container.querySelector<HTMLAnchorElement>(
      '[data-role="about-review-link"]',
    );
    expect(reviewLink?.href).toBe(
      "https://chromewebstore.google.com/detail/ytm-enhancer/bilcedjabgiedoamakekncokccabdccp/reviews",
    );
  });

  it("should link the review prompt to Firefox Add-ons in Firefox", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 Firefox/126.0",
    });

    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const reviewLink = container.querySelector<HTMLAnchorElement>(
      '[data-role="about-review-link"]',
    );
    expect(reviewLink?.href).toBe(
      "https://addons.mozilla.org/en-US/firefox/addon/ytm-enhancer/reviews/",
    );
  });

  it("should hide the review prompt when dismissed", () => {
    storage["about.reviewPromptDismissed"] = true;

    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const reviewCard = container.querySelector<HTMLElement>(
      '[data-role="about-review-card"]',
    );
    expect(reviewCard?.classList.contains("is-hidden")).toBe(true);
  });

  it("should persist dismissal when the close button is clicked", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const reviewCard = container.querySelector<HTMLElement>(
      '[data-role="about-review-card"]',
    );
    const dismissButton = container.querySelector<HTMLButtonElement>(
      '[data-role="about-review-dismiss"]',
    );
    dismissButton?.click();

    expect(storage["about.reviewPromptDismissed"]).toBe(true);
    expect(reviewCard?.classList.contains("is-hidden")).toBe(true);
  });

  it("shows the question step initially", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const question = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-question"]',
    );
    const positive = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-positive"]',
    );
    const negative = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-negative"]',
    );

    expect(question?.classList.contains("is-hidden")).toBe(false);
    expect(positive?.classList.contains("is-hidden")).toBe(true);
    expect(negative?.classList.contains("is-hidden")).toBe(true);
  });

  it("routes to the review CTA when the user reports enjoying the extension", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    container
      .querySelector<HTMLButtonElement>('[data-role="about-review-yes"]')
      ?.click();

    const question = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-question"]',
    );
    const positive = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-positive"]',
    );

    expect(question?.classList.contains("is-hidden")).toBe(true);
    expect(positive?.classList.contains("is-hidden")).toBe(false);
    expect(storage["about.reviewPromptSentiment"]).toBe("positive");
  });

  it("routes to the feedback CTA when the user reports issues", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    container
      .querySelector<HTMLButtonElement>('[data-role="about-review-no"]')
      ?.click();

    const question = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-question"]',
    );
    const negative = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-negative"]',
    );

    expect(question?.classList.contains("is-hidden")).toBe(true);
    expect(negative?.classList.contains("is-hidden")).toBe(false);
    expect(storage["about.reviewPromptSentiment"]).toBe("negative");
  });

  it("restores the previously selected sentiment step on render", () => {
    storage["about.reviewPromptSentiment"] = "positive";

    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const question = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-question"]',
    );
    const positive = container.querySelector<HTMLElement>(
      '[data-role="about-review-step-positive"]',
    );

    expect(question?.classList.contains("is-hidden")).toBe(true);
    expect(positive?.classList.contains("is-hidden")).toBe(false);
  });

  it("dismisses the prompt after the user follows the review link", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const reviewLink = container.querySelector<HTMLAnchorElement>(
      '[data-role="about-review-link"]',
    );
    reviewLink?.click();

    expect(storage["about.reviewPromptDismissed"]).toBe(true);
  });

  it("dismisses the prompt after the user follows the feedback link", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    const feedbackLink = container.querySelector<HTMLAnchorElement>(
      '[data-role="about-review-feedback"]',
    );
    feedbackLink?.click();

    expect(storage["about.reviewPromptDismissed"]).toBe(true);
  });
});

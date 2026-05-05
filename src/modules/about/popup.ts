import type { PopupView } from "@/core/types";
import {
  getBuildTimestampLabel,
  getBuildVersionLabel,
} from "@/core/build-info";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";
import {
  ABOUT_VIEW_ID,
  REVIEW_PROMPT_DISMISSED_KEY,
  REVIEW_PROMPT_SENTIMENT_KEY,
} from "./review-prompt";

const STORE_URLS = {
  chrome:
    "https://chromewebstore.google.com/detail/ytm-enhancer/bilcedjabgiedoamakekncokccabdccp/reviews",
  edge: "https://microsoftedge.microsoft.com/addons/detail/ytm-enhancer/gamefnibdabclmkngggcjghpbhjmajkm",
  firefox:
    "https://addons.mozilla.org/en-US/firefox/addon/ytm-enhancer/reviews/",
} as const;

type ReviewStep = "question" | "positive" | "negative";

const STEP_ROLE: Record<ReviewStep, string> = {
  question: "about-review-step-question",
  positive: "about-review-step-positive",
  negative: "about-review-step-negative",
};

function getReviewUrl(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes("Firefox")) return STORE_URLS.firefox;
  if (userAgent.includes("Edg/")) return STORE_URLS.edge;
  return STORE_URLS.chrome;
}

function setReviewCardVisible(
  card: HTMLElement | null,
  visible: boolean,
): void {
  card?.classList.toggle("is-hidden", !visible);
}

function showStep(container: HTMLElement, step: ReviewStep): void {
  for (const [name, role] of Object.entries(STEP_ROLE) as [
    ReviewStep,
    string,
  ][]) {
    const el = container.querySelector<HTMLElement>(`[data-role="${role}"]`);
    el?.classList.toggle("is-hidden", name !== step);
  }
}

function persist(items: Record<string, unknown>): void {
  try {
    chrome.storage.local.set(items);
  } catch {
    // Storage may be unavailable in tests or invalidated popup contexts.
  }
}

/** Create the About popup view. */
export function createAboutPopupView(): PopupView {
  return {
    id: ABOUT_VIEW_ID,
    label: "About",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const versionEl = container.querySelector<HTMLElement>(
        '[data-role="about-version"]',
      );
      if (versionEl) {
        const manifest = chrome.runtime.getManifest();
        versionEl.textContent = getBuildVersionLabel(manifest.version);
      }

      const timestampEl = container.querySelector<HTMLElement>(
        '[data-role="about-build-timestamp"]',
      );
      const buildTimestampLabel = getBuildTimestampLabel();
      if (timestampEl && buildTimestampLabel) {
        timestampEl.textContent = buildTimestampLabel;
        timestampEl.classList.remove("is-hidden");
      }

      const reviewCard = container.querySelector<HTMLElement>(
        '[data-role="about-review-card"]',
      );
      const reviewLink = container.querySelector<HTMLAnchorElement>(
        '[data-role="about-review-link"]',
      );
      const feedbackLink = container.querySelector<HTMLAnchorElement>(
        '[data-role="about-review-feedback"]',
      );
      const dismissButton = container.querySelector<HTMLButtonElement>(
        '[data-role="about-review-dismiss"]',
      );
      const yesButton = container.querySelector<HTMLButtonElement>(
        '[data-role="about-review-yes"]',
      );
      const noButton = container.querySelector<HTMLButtonElement>(
        '[data-role="about-review-no"]',
      );

      if (reviewLink) {
        reviewLink.href = getReviewUrl();
      }

      try {
        chrome.storage.local.get(
          [REVIEW_PROMPT_DISMISSED_KEY, REVIEW_PROMPT_SENTIMENT_KEY],
          (result) => {
            const dismissed = result[REVIEW_PROMPT_DISMISSED_KEY] === true;
            setReviewCardVisible(reviewCard, !dismissed);
            const sentiment = result[REVIEW_PROMPT_SENTIMENT_KEY];
            if (sentiment === "positive") showStep(container, "positive");
            else if (sentiment === "negative") showStep(container, "negative");
            else showStep(container, "question");
          },
        );
      } catch {
        setReviewCardVisible(reviewCard, true);
        showStep(container, "question");
      }

      yesButton?.addEventListener("click", () => {
        showStep(container, "positive");
        persist({ [REVIEW_PROMPT_SENTIMENT_KEY]: "positive" });
      });

      noButton?.addEventListener("click", () => {
        showStep(container, "negative");
        persist({ [REVIEW_PROMPT_SENTIMENT_KEY]: "negative" });
      });

      dismissButton?.addEventListener("click", () => {
        setReviewCardVisible(reviewCard, false);
        persist({ [REVIEW_PROMPT_DISMISSED_KEY]: true });
      });

      const dismissOnFollow = () => {
        persist({ [REVIEW_PROMPT_DISMISSED_KEY]: true });
      };
      reviewLink?.addEventListener("click", dismissOnFollow);
      feedbackLink?.addEventListener("click", dismissOnFollow);
    },
  };
}

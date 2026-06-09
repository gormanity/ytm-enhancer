import { getAllPopupViews } from "@/modules/popup-views";
import { isDevBuild } from "@/core/build-info";
import { addRuntimeMessageListener } from "@/core/runtime-listener";
import {
  ABOUT_VIEW_ID,
  REVIEW_PROMPT_ACCESSED_KEY,
  REVIEW_PROMPT_DISMISSED_KEY,
} from "@/modules/about/review-prompt";
import { parseHtmlFragment } from "./html-fragment";

const container = document.getElementById("view-container");
const navList = document.getElementById("nav-list");
const appTitle = document.querySelector<HTMLElement>('[data-role="app-title"]');
const devBuildConflictBanner = document.getElementById(
  "dev-build-conflict-banner",
);
const navItemTemplate = document.getElementById(
  "nav-item-template",
) as HTMLTemplateElement | null;

const views = getAllPopupViews();
const ACTIVE_VIEW_ID_STORAGE_KEY = "active-view-id";
const LEGACY_ACTIVE_VIEW_IDS: Record<string, string> = {
  "auto-play-settings": "automation-settings",
  "auto-skip-disliked-settings": "automation-settings",
};

function restoreActiveViewId(): string | undefined {
  const storedViewId = localStorage.getItem(ACTIVE_VIEW_ID_STORAGE_KEY);
  const normalizedViewId = storedViewId
    ? (LEGACY_ACTIVE_VIEW_IDS[storedViewId] ?? storedViewId)
    : views[0]?.id;

  if (storedViewId && normalizedViewId !== storedViewId) {
    localStorage.setItem(ACTIVE_VIEW_ID_STORAGE_KEY, normalizedViewId);
  }

  return normalizedViewId;
}

let activeViewId = restoreActiveViewId();
let activeViewCleanup: (() => void) | null = null;
let showAboutReviewIndicator = false;

function getLocalStorage(
  keys: string[],
  callback: (result: Record<string, unknown>) => void,
): void {
  try {
    chrome.storage.local.get(keys, callback);
  } catch {
    callback({});
  }
}

function setLocalStorage(items: Record<string, unknown>): void {
  try {
    chrome.storage.local.set(items);
  } catch {
    // Storage may be unavailable in tests or invalidated popup contexts.
  }
}

function refreshDevBuildConflictStatus(): void {
  if (!devBuildConflictBanner || isDevBuild()) return;

  try {
    chrome.runtime.sendMessage(
      { type: "get-dev-build-conflict-status" },
      (
        response?: {
          ok?: boolean;
          data?: { duplicateDetected?: boolean };
        } | null,
      ) => {
        if (chrome.runtime.lastError) return;
        const duplicateDetected =
          response?.ok === true && response.data?.duplicateDetected === true;
        devBuildConflictBanner.classList.toggle(
          "is-hidden",
          !duplicateDetected,
        );
      },
    );
  } catch {
    // Runtime messaging may be unavailable in tests or invalidated popups.
  }
}

function listenForDevBuildConflictStatus(): void {
  if (!devBuildConflictBanner || isDevBuild()) return;

  try {
    addRuntimeMessageListener((message: { type?: string }) => {
      if (message.type === "dev-build-conflict-status-changed") {
        refreshDevBuildConflictStatus();
      }
    });
  } catch {
    // Runtime messaging may be unavailable in tests or invalidated popups.
  }
}

function markAboutReviewPromptAccessed(): void {
  if (activeViewId !== ABOUT_VIEW_ID) return;
  showAboutReviewIndicator = false;
  setLocalStorage({ [REVIEW_PROMPT_ACCESSED_KEY]: true });
}

function loadAboutReviewIndicator() {
  getLocalStorage(
    [REVIEW_PROMPT_ACCESSED_KEY, REVIEW_PROMPT_DISMISSED_KEY],
    (result) => {
      const accessed = result[REVIEW_PROMPT_ACCESSED_KEY] === true;
      const dismissed = result[REVIEW_PROMPT_DISMISSED_KEY] === true;
      showAboutReviewIndicator = !accessed && !dismissed;
      markAboutReviewPromptAccessed();
      renderNav();
    },
  );
}

function renderDevBuildBadge() {
  if (!appTitle || !isDevBuild()) return;

  const badge = document.createElement("span");
  badge.className = "dev-build-badge";
  badge.textContent = "DEV";
  appTitle.appendChild(badge);
}

function renderNav() {
  if (!navList) return;
  navList.replaceChildren();

  for (const view of views) {
    const item = createNavItem(view.id, view.label, view.icon);
    if (!item) continue;
    item.classList.toggle("active", view.id === activeViewId);
    item.classList.toggle(
      "has-notification",
      view.id === ABOUT_VIEW_ID && showAboutReviewIndicator,
    );
    item.onclick = () => switchView(view.id);
    navList.appendChild(item);
  }
}

function createNavItem(
  id: string,
  label: string,
  icon?: string,
): HTMLDivElement | null {
  if (!navItemTemplate) return null;

  const fragment = navItemTemplate.content.cloneNode(true) as DocumentFragment;
  const item =
    fragment.firstElementChild instanceof HTMLDivElement
      ? fragment.firstElementChild
      : null;
  if (!item) return null;

  const labelElement = item.querySelector<HTMLElement>('[data-role="label"]');
  if (labelElement) {
    labelElement.textContent = label;
  }

  const iconElement = item.querySelector<HTMLElement>('[data-role="icon"]');
  if (iconElement) {
    if (icon) {
      iconElement.replaceChildren(parseHtmlFragment(icon));
    } else {
      iconElement.remove();
    }
  }

  item.dataset.viewId = id;
  return item;
}

function switchView(viewId: string) {
  activeViewId = viewId;
  localStorage.setItem(ACTIVE_VIEW_ID_STORAGE_KEY, viewId);
  markAboutReviewPromptAccessed();
  renderNav();
  renderActiveView();
}

function renderActiveView() {
  if (!container) return;
  activeViewCleanup?.();
  activeViewCleanup = null;
  container.replaceChildren();

  const view = views.find((v) => v.id === activeViewId) || views[0];
  if (view) {
    const section = document.createElement("section");
    const cleanup = view.render(section);
    if (typeof cleanup === "function") {
      activeViewCleanup = cleanup;
    }
    container.replaceChildren(section);
  }
}

if (container && navList) {
  loadAboutReviewIndicator();
  renderDevBuildBadge();
  refreshDevBuildConflictStatus();
  listenForDevBuildConflictStatus();
  renderNav();
  renderActiveView();
}

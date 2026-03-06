import type { PopupView, PlaybackState } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { createSvgIconTemplate, setButtonSvgIcon } from "@/popup/svg-icon";
import ytmTabFallbackIconUrl from "@/assets/ytm-logo.svg";
import { createPlaybackSpeedPopupView } from "../playback-speed/popup";
import { createStreamQualityPopupView } from "../stream-quality/popup";
import templateHtml from "./popup.html?raw";

const PLAY_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
const PLAY_ICON_TEMPLATE = createSvgIconTemplate(PLAY_SVG);
const PAUSE_ICON_TEMPLATE = createSvgIconTemplate(PAUSE_SVG);

interface YtmTabSummary {
  id: number | null;
  title: string;
  artworkUrl: string | null;
  isSelected: boolean;
}

const YTM_FALLBACK_ICON_URL = ytmTabFallbackIconUrl;

interface VolumeElements {
  numberInput: HTMLInputElement;
  range: HTMLInputElement;
  placeholder: HTMLElement | null;
}

interface NowPlayingElements {
  artwork: HTMLImageElement;
  title: HTMLElement;
  artist: HTMLElement;
  controls: HTMLElement;
  prevButton: HTMLButtonElement;
  playButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
}

/** Create the combined Quick Settings popup view. */
export function createQuickSettingsPopupView(): PopupView {
  return {
    id: "quick-settings",
    label: "Quick Settings",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const cleanups: Array<() => void> = [];

      const tabsCard = container.querySelector<HTMLElement>(
        '[data-role="quick-tabs-card"]',
      );
      const tabsList = container.querySelector<HTMLElement>(
        '[data-role="quick-tabs-list"]',
      );
      const tabItemTemplate = container.querySelector<HTMLTemplateElement>(
        '[data-role="quick-tab-item-template"]',
      );
      const artwork = container.querySelector<HTMLImageElement>(
        '[data-role="quick-now-playing-artwork"]',
      );
      const title = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-title"]',
      );
      const artist = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-artist"]',
      );
      const controls = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-controls"]',
      );
      const prevButton = container.querySelector<HTMLButtonElement>(
        '[data-role="quick-now-playing-prev"]',
      );
      const playButton = container.querySelector<HTMLButtonElement>(
        '[data-role="quick-now-playing-play"]',
      );
      const nextButton = container.querySelector<HTMLButtonElement>(
        '[data-role="quick-now-playing-next"]',
      );
      const numberInput = container.querySelector<HTMLInputElement>(
        '[data-role="quick-volume-number-input"]',
      );
      const range = container.querySelector<HTMLInputElement>(
        '[data-role="quick-volume-range"]',
      );
      const placeholder = container.querySelector<HTMLElement>(
        '[data-role="quick-volume-placeholder"]',
      );
      const speedSlot = container.querySelector<HTMLElement>(
        '[data-role="quick-speed-slot"]',
      );
      const qualitySlot = container.querySelector<HTMLElement>(
        '[data-role="quick-quality-slot"]',
      );
      if (
        !tabsCard ||
        !tabsList ||
        !tabItemTemplate ||
        !artwork ||
        !title ||
        !artist ||
        !controls ||
        !prevButton ||
        !playButton ||
        !nextButton ||
        !numberInput ||
        !range ||
        !speedSlot ||
        !qualitySlot
      ) {
        return;
      }

      cleanups.push(
        renderOpenTabs(container, tabsCard, tabsList, tabItemTemplate),
      );
      cleanups.push(
        renderCompactNowPlaying({
          artwork,
          title,
          artist,
          controls,
          prevButton,
          playButton,
          nextButton,
        }),
      );
      renderIntegratedVolume({ numberInput, range, placeholder });
      renderEmbeddedSelect(createPlaybackSpeedPopupView(), speedSlot);
      renderEmbeddedSelect(createStreamQualityPopupView(), qualitySlot);

      return () => {
        for (const cleanup of cleanups) cleanup();
      };
    },
  };
}

function renderEmbeddedSelect(view: PopupView, target: HTMLElement): void {
  const content = document.createElement("div");
  view.render(content);
  content.querySelector("h2")?.remove();

  const label = content.querySelector(".toggle-row span");
  if (label)
    (label as HTMLElement).classList.add("quick-settings-select-label");

  target.appendChild(content);
}

function renderOpenTabs(
  container: HTMLElement,
  card: HTMLElement,
  list: HTMLElement,
  itemTemplate: HTMLTemplateElement,
): () => void {
  let lastRenderedSignature: string | null = null;
  let currentTabs: YtmTabSummary[] = [];
  let renderEpoch = 0;
  const artworkCache = new Map<number, string>();
  const artworkRequests = new Set<number>();
  const attemptedArtworkTabs = new Set<number>();

  const preloadImage = (url: string): Promise<boolean> =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });

  const pickTabIconCandidates = (
    tab: YtmTabSummary,
    artworkUrl?: string | null,
  ): string[] => {
    const result: string[] = [];
    const candidates = [artworkUrl ?? tab.artworkUrl, YTM_FALLBACK_ICON_URL];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const trimmed = candidate.trim();
      if (trimmed.length === 0 || result.includes(trimmed)) continue;
      result.push(trimmed);
    }
    return result;
  };

  const renderTabs = (tabs: YtmTabSummary[]) => {
    renderEpoch += 1;
    const currentEpoch = renderEpoch;
    list.replaceChildren();

    for (const tab of tabs) {
      const itemFragment = itemTemplate.content.cloneNode(
        true,
      ) as DocumentFragment;
      const item =
        itemFragment.firstElementChild instanceof HTMLElement
          ? itemFragment.firstElementChild
          : null;
      const icon = item?.querySelector("img");
      if (!item || !icon) continue;

      if (tab.isSelected) item.classList.add("selected");
      icon.alt = "";
      const cachedArtwork = tab.id === null ? null : artworkCache.get(tab.id);
      const iconCandidates = pickTabIconCandidates(tab, cachedArtwork);
      let candidateIndex = 0;
      const assignNextCandidate = () => {
        if (candidateIndex >= iconCandidates.length) return;
        icon.src = iconCandidates[candidateIndex];
        candidateIndex += 1;
      };
      icon.onerror = () => {
        assignNextCandidate();
      };
      assignNextCandidate();

      item.title = tab.title.replace(" - YouTube Music", "");
      item.onclick = () => {
        if (tab.id === null) return;
        chrome.runtime.sendMessage({ type: "set-selected-tab", tabId: tab.id });
        updateTabs();
      };
      item.ondblclick = () => {
        if (tab.id === null) return;
        chrome.runtime.sendMessage({ type: "focus-ytm-tab", tabId: tab.id });
      };

      list.appendChild(item);

      if (tab.id === null) continue;
      const tabId = tab.id;
      if (
        cachedArtwork !== undefined ||
        attemptedArtworkTabs.has(tabId) ||
        artworkRequests.has(tabId)
      ) {
        continue;
      }
      attemptedArtworkTabs.add(tabId);
      artworkRequests.add(tabId);
      chrome.runtime.sendMessage(
        { type: "get-ytm-tab-artwork", tabId },
        async (response) => {
          artworkRequests.delete(tabId);
          const artworkUrl = response?.ok
            ? (response.data?.artworkUrl as string | null)
            : null;
          if (!artworkUrl) return;
          const didLoad = await preloadImage(artworkUrl);
          if (!didLoad) return;
          artworkCache.set(tabId, artworkUrl);
          if (currentEpoch !== renderEpoch || !icon.isConnected) {
            return;
          }
          icon.onerror = null;
          icon.src = artworkUrl;
        },
      );
    }
  };

  const updateTabs = () => {
    chrome.runtime.sendMessage({ type: "get-ytm-tabs" }, (response) => {
      const tabs = (response?.ok ? response.data?.tabs : []) as YtmTabSummary[];
      if (!Array.isArray(tabs) || tabs.length <= 1) {
        card.classList.add("is-hidden");
        currentTabs = [];
        lastRenderedSignature = null;
        return;
      }

      const signature = JSON.stringify(
        tabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          artworkUrl: tab.artworkUrl,
          isSelected: tab.isSelected,
        })),
      );

      if (signature === lastRenderedSignature) return;
      lastRenderedSignature = signature;

      card.classList.remove("is-hidden");
      currentTabs = tabs;
      renderTabs(tabs);
    });
  };

  const cycleSelectedTab = (reverse = false) => {
    if (currentTabs.length <= 1) return;
    const selectedIndex = currentTabs.findIndex((tab) => tab.isSelected);
    const baseIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const direction = reverse ? -1 : 1;
    const nextIndex =
      (baseIndex + direction + currentTabs.length) % currentTabs.length;
    const nextTab = currentTabs[nextIndex];
    if (nextTab.id === null) return;
    chrome.runtime.sendMessage({ type: "set-selected-tab", tabId: nextTab.id });
    updateTabs();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target;
    const focusedElement = document.activeElement;
    const isInQuickSettings =
      (target instanceof Node && container.contains(target)) ||
      (focusedElement instanceof Node && container.contains(focusedElement)) ||
      focusedElement === document.body;
    if (!isInQuickSettings) return;

    if (
      target instanceof HTMLElement &&
      target.matches(
        "input, select, textarea, button, [contenteditable='true']",
      )
    ) {
      return;
    }

    event.preventDefault();
    cycleSelectedTab(event.shiftKey);
  };

  document.addEventListener("keydown", handleKeydown);
  updateTabs();
  const pollId = window.setInterval(updateTabs, 3000);
  return () => {
    document.removeEventListener("keydown", handleKeydown);
    window.clearInterval(pollId);
  };
}

/** Helper to update the red foreground fill on range inputs */
function updateSliderBackground(range: HTMLInputElement) {
  const percent = Number(range.value);
  range.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${percent}%, #3f3f3f ${percent}%, #3f3f3f 100%)`;
}

/** Renders a specifically styled volume control that associates the slider and input */
function renderIntegratedVolume(elements: VolumeElements) {
  const { numberInput, range, placeholder } = elements;
  numberInput.disabled = true;
  numberInput.value = "";
  range.disabled = true;
  range.value = "0";
  updateSliderBackground(range);

  chrome.runtime.sendMessage(
    { type: "get-volume" },
    (response: { ok: boolean; data?: number } | null) => {
      if (response?.ok) {
        const vol = Math.round((response.data ?? 1) * 100);
        range.value = String(vol);
        numberInput.value = String(vol);
        range.disabled = false;
        numberInput.disabled = false;
        placeholder?.remove();
        updateSliderBackground(range);
      }
    },
  );

  const updateVol = (val: number) => {
    chrome.runtime.sendMessage({ type: "set-volume", volume: val / 100 });
  };

  range.addEventListener("input", () => {
    numberInput.value = range.value;
    updateVol(Number(range.value));
    updateSliderBackground(range);
  });

  numberInput.addEventListener("change", () => {
    const val = Math.max(0, Math.min(100, Number(numberInput.value)));
    numberInput.value = String(val);
    range.value = String(val);
    updateVol(val);
    updateSliderBackground(range);
  });
}

function renderCompactNowPlaying(elements: NowPlayingElements): () => void {
  const {
    artwork,
    title,
    artist,
    controls,
    prevButton,
    playButton,
    nextButton,
  } = elements;

  artwork.onerror = () => {
    artwork.removeAttribute("src");
    artwork.classList.add("is-hidden");
  };

  prevButton.onclick = () =>
    chrome.runtime.sendMessage({ type: "playback-action", action: "previous" });
  playButton.onclick = () =>
    chrome.runtime.sendMessage({
      type: "playback-action",
      action: "togglePlay",
    });
  nextButton.onclick = () =>
    chrome.runtime.sendMessage({ type: "playback-action", action: "next" });

  const update = () => {
    chrome.runtime.sendMessage(
      { type: "get-playback-state" },
      (
        response: { ok: boolean; data?: PlaybackState; error?: string } | null,
      ) => {
        if (response?.ok && response.data) {
          const state = response.data;
          const hasTrack = Boolean(state.title && state.artist);

          if (hasTrack && state.artworkUrl) {
            artwork.src = state.artworkUrl;
            artwork.classList.remove("is-hidden");
          } else {
            artwork.removeAttribute("src");
            artwork.classList.add("is-hidden");
          }
          title.textContent = state.title || "No track loaded";
          artist.textContent = state.artist || "Start playback to see details";
          controls.classList.toggle("is-hidden", !hasTrack);

          setButtonSvgIcon(
            playButton,
            state.isPlaying ? PAUSE_ICON_TEMPLATE : PLAY_ICON_TEMPLATE,
          );
        } else {
          artwork.classList.add("is-hidden");
          controls.classList.add("is-hidden");
          if (response?.error === "No YTM tab") {
            title.textContent = "YouTube Music not found";
            artist.textContent = "Open YTM to get started";
          } else {
            title.textContent = "No music playing";
            artist.textContent = "Waiting for playback...";
          }
        }
      },
    );
  };

  update();
  const pollId = window.setInterval(update, 1000);
  return () => {
    window.clearInterval(pollId);
  };
}

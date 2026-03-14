import type { PopupView, PlaybackState } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { createSvgIconTemplate, setButtonSvgIcon } from "@/popup/svg-icon";
import { bindRange } from "@/popup/bind-range";
import { ProgressBarController, formatTimestamp } from "@/ui/progress-bar";
import ytmTabFallbackIconUrl from "@/assets/ytm-logo.svg";
import { renderPlaybackSpeedSelectControl } from "./playback-speed/popup";
import { renderStreamQualitySelectControl } from "./stream-quality/popup";
import templateHtml from "./popup.html?raw";

const PLAY_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
const PLAYBACK_STATE_POLL_INTERVAL_MS = 1000;

let playIconTemplate: SVGElement | null | undefined;
let pauseIconTemplate: SVGElement | null | undefined;

function getPlayIconTemplate(): SVGElement | null {
  if (playIconTemplate === undefined) {
    playIconTemplate = createSvgIconTemplate(PLAY_SVG);
  }
  return playIconTemplate;
}

function getPauseIconTemplate(): SVGElement | null {
  if (pauseIconTemplate === undefined) {
    pauseIconTemplate = createSvgIconTemplate(PAUSE_SVG);
  }
  return pauseIconTemplate;
}

interface YtmTabSummary {
  id: number | null;
  title: string;
  artworkUrl: string | null;
  isSelected: boolean;
}

const YTM_FALLBACK_ICON_URL = ytmTabFallbackIconUrl;

interface NowPlayingElements {
  artwork: HTMLImageElement;
  title: HTMLElement;
  artist: HTMLElement;
  controls: HTMLElement;
  prevButton: HTMLButtonElement;
  playButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  progressContainer: HTMLElement;
  progressBar: HTMLElement;
  progressFill: HTMLElement;
  progressThumb: HTMLElement;
  elapsed: HTMLElement;
  duration: HTMLElement;
}

/** Create the combined Playback Controls popup view. */
export function createPlaybackControlsPopupView(): PopupView {
  return {
    id: "playback-controls",
    label: "Playback Controls",
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
      const progressContainer = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-progress"]',
      );
      const progressBar = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-progress-bar"]',
      );
      const progressFill = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-progress-fill"]',
      );
      const progressThumb = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-progress-thumb"]',
      );
      const elapsed = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-elapsed"]',
      );
      const duration = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-duration"]',
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
        !progressContainer ||
        !progressBar ||
        !progressFill ||
        !progressThumb ||
        !elapsed ||
        !duration ||
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
          progressContainer,
          progressBar,
          progressFill,
          progressThumb,
          elapsed,
          duration,
        }),
      );
      const volumePlaceholder = container.querySelector<HTMLElement>(
        '[data-role="quick-volume-placeholder"]',
      );
      bindRange(container, "quick-volume-range", {
        getType: "get-volume",
        setType: "set-volume",
        setKey: "volume",
        parseData: (data) => Math.round(((data as number) ?? 1) * 100),
        transformValue: (v) => v / 100,
        numberInputRole: "quick-volume-number-input",
        fillTrack: true,
        onLoaded: () => volumePlaceholder?.remove(),
      });
      renderPlaybackSpeedSelectControl(speedSlot);
      renderStreamQualitySelectControl(qualitySlot);

      speedSlot
        .querySelector<HTMLElement>(".toggle-row span")
        ?.classList.add("playback-controls-select-label");
      qualitySlot
        .querySelector<HTMLElement>(".toggle-row span")
        ?.classList.add("playback-controls-select-label");

      return () => {
        for (const cleanup of cleanups) cleanup();
      };
    },
  };
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
    const isInPlaybackControls =
      (target instanceof Node && container.contains(target)) ||
      (focusedElement instanceof Node && container.contains(focusedElement)) ||
      focusedElement === document.body;
    if (!isInPlaybackControls) return;

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
  const runtimeMessageListener = (message: { type?: string }) => {
    if (message.type === "ytm-tabs-changed") {
      updateTabs();
    }
  };
  chrome.runtime.onMessage.addListener(runtimeMessageListener);
  updateTabs();
  return () => {
    chrome.runtime.onMessage.removeListener(runtimeMessageListener);
    document.removeEventListener("keydown", handleKeydown);
  };
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
    progressContainer,
    progressBar,
    progressFill,
    progressThumb,
    elapsed,
    duration,
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

  const progressCtrl = new ProgressBarController(
    { bar: progressBar, fill: progressFill, thumb: progressThumb },
    {
      onSeek: (time) => {
        chrome.runtime.sendMessage({
          type: "playback-action",
          action: "seekTo",
          time,
        });
      },
      onDrag: (ratio) => {
        elapsed.textContent = formatTimestamp(ratio * lastDuration);
      },
    },
  );

  let lastDuration = 0;

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

          lastDuration = state.duration;
          if (hasTrack && state.duration > 0) {
            progressCtrl.setProgress(state.progress, state.duration);
            if (!progressCtrl.dragging) {
              elapsed.textContent = formatTimestamp(state.progress);
            }
            duration.textContent = formatTimestamp(state.duration);
            progressContainer.classList.remove("is-hidden");
          } else {
            progressContainer.classList.add("is-hidden");
          }

          setButtonSvgIcon(
            playButton,
            state.isPlaying ? getPauseIconTemplate() : getPlayIconTemplate(),
          );
        } else {
          artwork.classList.add("is-hidden");
          controls.classList.add("is-hidden");
          progressContainer.classList.add("is-hidden");
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
  const pollId = window.setInterval(update, PLAYBACK_STATE_POLL_INTERVAL_MS);
  return () => {
    progressCtrl.destroy();
    window.clearInterval(pollId);
  };
}

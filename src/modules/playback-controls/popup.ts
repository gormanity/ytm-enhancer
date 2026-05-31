import type { ModuleContext, PopupView, PlaybackState } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { createSvgIconTemplate, setButtonSvgIcon } from "@/popup/svg-icon";
import { bindModuleRange } from "@/popup/module-ui";
import { createProgressBar } from "@/ui/progress-bar";
import ytmTabFallbackIconUrl from "@/assets/ytm-logo.svg";
import { renderPlaybackSpeedSelectControl } from "./playback-speed/popup";
import { renderStreamQualitySelectControl } from "./stream-quality/popup";
import templateHtml from "./popup.html?raw";

const PLAY_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
const REPEAT_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>';
const REPEAT_ONE_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>';
const PLAYBACK_STATE_POLL_INTERVAL_MS = 1000;

let playIconTemplate: SVGElement | null | undefined;
let pauseIconTemplate: SVGElement | null | undefined;
let repeatIconTemplate: SVGElement | null | undefined;
let repeatOneIconTemplate: SVGElement | null | undefined;

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

function getRepeatIconTemplate(
  repeatMode: PlaybackState["repeatMode"],
): SVGElement | null {
  if (repeatMode === "one") {
    if (repeatOneIconTemplate === undefined) {
      repeatOneIconTemplate = createSvgIconTemplate(REPEAT_ONE_SVG);
    }
    return repeatOneIconTemplate;
  }

  if (repeatIconTemplate === undefined) {
    repeatIconTemplate = createSvgIconTemplate(REPEAT_SVG);
  }
  return repeatIconTemplate;
}

function getRepeatLabel(repeatMode: PlaybackState["repeatMode"]): string {
  switch (repeatMode) {
    case "all":
      return "Repeat all";
    case "one":
      return "Repeat one";
    default:
      return "Repeat off";
  }
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
  repeatButton: HTMLButtonElement;
  progressSlot: HTMLElement;
}

/** Create the combined Playback Controls popup view. */
export function createPlaybackControlsPopupView(
  context: ModuleContext,
): PopupView {
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
      const repeatButton = container.querySelector<HTMLButtonElement>(
        '[data-role="quick-now-playing-repeat"]',
      );
      const progressSlot = container.querySelector<HTMLElement>(
        '[data-role="quick-now-playing-progress"]',
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
        !repeatButton ||
        !progressSlot ||
        !speedSlot ||
        !qualitySlot
      ) {
        return;
      }

      cleanups.push(
        renderOpenTabs(container, tabsCard, tabsList, tabItemTemplate, context),
      );
      cleanups.push(
        renderCompactNowPlaying(
          {
            artwork,
            title,
            artist,
            controls,
            prevButton,
            playButton,
            nextButton,
            repeatButton,
            progressSlot,
          },
          context,
        ),
      );
      bindModuleRange(container, "quick-volume-range", {
        label: "Volume",
        get: async () => Math.round((await context.ytm.getVolume()) * 100),
        set: (volume) => context.ytm.setVolume(volume / 100),
        unit: "%",
      });
      renderPlaybackSpeedSelectControl(speedSlot, context);
      renderStreamQualitySelectControl(qualitySlot, context);

      speedSlot
        .querySelector<HTMLElement>(".card-row span")
        ?.classList.add("playback-controls-select-label");
      qualitySlot
        .querySelector<HTMLElement>(".card-row span")
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
  context: ModuleContext,
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
        void context.ytm.selectTab(tab.id);
        updateTabs();
      };
      item.ondblclick = () => {
        if (tab.id === null) return;
        void context.ytm.focusTab(tab.id);
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
      const handleArtwork = async (artworkUrl: string | null) => {
        artworkRequests.delete(tabId);
        if (!artworkUrl) return;
        const didLoad = await preloadImage(artworkUrl);
        if (!didLoad) return;
        artworkCache.set(tabId, artworkUrl);
        if (currentEpoch !== renderEpoch || !icon.isConnected) {
          return;
        }
        icon.onerror = null;
        icon.src = artworkUrl;
      };
      void context.ytm.getTabArtwork(tabId).then(handleArtwork);
    }
  };

  const updateTabs = () => {
    const handleTabs = (tabs: YtmTabSummary[]) => {
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
    };
    void context.ytm.listTabs().then((state) => handleTabs(state.tabs));
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
    void context.ytm.selectTab(nextTab.id);
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
  const unsubscribe = context.runtime.subscribe(runtimeMessageListener);
  updateTabs();
  return () => {
    unsubscribe();
    document.removeEventListener("keydown", handleKeydown);
  };
}

function renderCompactNowPlaying(
  elements: NowPlayingElements,
  context: ModuleContext,
): () => void {
  const {
    artwork,
    title,
    artist,
    controls,
    prevButton,
    playButton,
    nextButton,
    repeatButton,
    progressSlot,
  } = elements;

  artwork.onerror = () => {
    artwork.removeAttribute("src");
    artwork.classList.add("is-hidden");
  };

  const executeAction = (
    action: "previous" | "togglePlay" | "next" | "repeat",
  ) => {
    void context.ytm.executePlaybackAction(action);
  };

  prevButton.onclick = () => executeAction("previous");
  playButton.onclick = () => executeAction("togglePlay");
  nextButton.onclick = () => executeAction("next");
  repeatButton.onclick = () => executeAction("repeat");

  const progressBar = createProgressBar({
    onSeek: (time) => {
      void context.ytm.seekTo(time);
    },
  });
  progressSlot.replaceChildren(progressBar.element);

  const update = () => {
    const handleResponse = (
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

        if (hasTrack && state.duration > 0) {
          progressBar.setProgress(state.progress, state.duration);
          progressSlot.classList.remove("is-hidden");
        } else {
          progressSlot.classList.add("is-hidden");
        }

        setButtonSvgIcon(
          playButton,
          state.isPlaying ? getPauseIconTemplate() : getPlayIconTemplate(),
        );
        const repeatMode = state.repeatMode ?? "off";
        const repeatLabel = getRepeatLabel(repeatMode);
        setButtonSvgIcon(repeatButton, getRepeatIconTemplate(repeatMode));
        repeatButton.classList.toggle("active", repeatMode !== "off");
        repeatButton.setAttribute(
          "aria-pressed",
          repeatMode !== "off" ? "true" : "false",
        );
        repeatButton.setAttribute("aria-label", repeatLabel);
        repeatButton.title = repeatLabel;
      } else {
        artwork.classList.add("is-hidden");
        controls.classList.add("is-hidden");
        progressSlot.classList.add("is-hidden");
        if (response?.error === "No YTM tab") {
          title.textContent = "YouTube Music not found";
          artist.textContent = "Open YTM to get started";
        } else {
          title.textContent = "No music playing";
          artist.textContent = "Waiting for playback...";
        }
      }
    };
    void context.ytm
      .getPlaybackState()
      .then((state) => handleResponse({ ok: true, data: state }))
      .catch((err: Error) => handleResponse({ ok: false, error: err.message }));
  };

  update();
  const pollId = window.setInterval(update, PLAYBACK_STATE_POLL_INTERVAL_MS);
  return () => {
    progressBar.destroy();
    window.clearInterval(pollId);
  };
}

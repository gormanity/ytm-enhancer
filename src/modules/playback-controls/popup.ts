import type { ModuleContext, PopupView, PlaybackState } from "@/core/types";
import {
  createPlaybackController,
  createYtmPlaybackDriver,
  type PlaybackControllerSnapshot,
} from "@/core/playback-controller";
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
const SHUFFLE_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.45 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>';
const REPEAT_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>';
const REPEAT_ONE_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><title>Repeat one</title><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/><path data-icon-part="repeat-one-marker" d="M12.8 15.6V8.4l-1.9 1.2M11.2 15.6h3.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>';
const PLAYBACK_STATE_POLL_INTERVAL_MS = 1000;

let playIconTemplate: SVGElement | null | undefined;
let pauseIconTemplate: SVGElement | null | undefined;
let shuffleIconTemplate: SVGElement | null | undefined;
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

function getShuffleIconTemplate(): SVGElement | null {
  if (shuffleIconTemplate === undefined) {
    shuffleIconTemplate = createSvgIconTemplate(SHUFFLE_SVG);
  }
  return shuffleIconTemplate;
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
  shuffleButton: HTMLButtonElement;
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
      const shuffleButton = container.querySelector<HTMLButtonElement>(
        '[data-role="quick-now-playing-shuffle"]',
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
        !shuffleButton ||
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
            shuffleButton,
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
    shuffleButton,
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

  const playbackController = createPlaybackController(
    createYtmPlaybackDriver(context.ytm),
    { pollIntervalMs: PLAYBACK_STATE_POLL_INTERVAL_MS },
  );

  const executeAction = (
    action: "shuffle" | "previous" | "togglePlay" | "next" | "repeat",
  ) => {
    void playbackController.executeAction(action);
  };

  shuffleButton.onclick = () => executeAction("shuffle");
  prevButton.onclick = () => executeAction("previous");
  playButton.onclick = () => executeAction("togglePlay");
  nextButton.onclick = () => executeAction("next");
  repeatButton.onclick = () => executeAction("repeat");

  const progressBar = createProgressBar({
    onSeek: (time) => {
      void playbackController.seekTo(time);
    },
  });
  progressSlot.replaceChildren(progressBar.element);

  const handleSnapshot = (snapshot: PlaybackControllerSnapshot) => {
    if (snapshot.ok) {
      const state = snapshot.data;
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
      const shuffleLabel = state.isShuffling ? "Shuffle on" : "Shuffle off";
      setButtonSvgIcon(shuffleButton, getShuffleIconTemplate());
      shuffleButton.classList.toggle("active", state.isShuffling === true);
      shuffleButton.setAttribute(
        "aria-pressed",
        state.isShuffling === true ? "true" : "false",
      );
      shuffleButton.setAttribute("aria-label", shuffleLabel);
      shuffleButton.title = shuffleLabel;

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
      if (snapshot.error === "No YTM tab") {
        title.textContent = "YouTube Music not found";
        artist.textContent = "Open YTM to get started";
      } else {
        title.textContent = "No music playing";
        artist.textContent = "Waiting for playback...";
      }
    }
  };

  const unsubscribePlayback = playbackController.subscribe(handleSnapshot);
  playbackController.start();
  return () => {
    unsubscribePlayback();
    playbackController.destroy();
    progressBar.destroy();
  };
}

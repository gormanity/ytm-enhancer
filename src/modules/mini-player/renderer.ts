import type { PlaybackAction, PlaybackState } from "@/core/types";
import { setElementSvgIcon } from "@/core/svg-icon";
import type { ProgressBarComponent } from "@/ui/progress-bar";
import { createProgressBar } from "@/ui/progress-bar";
import progressBarCss from "@/ui/progress-bar.css?raw";

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>`;
const PREV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
const NEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z"/></svg>`;
const SHUFFLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.45 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`;
const REPEAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
const REPEAT_ONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>`;
const THUMBS_UP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L14 1 7.6 7.4C7.2 7.8 7 8.3 7 8.8V19c0 1.1.9 2 2 2h7c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.8v-2z"/></svg>`;
const THUMBS_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M15 3H8c-.8 0-1.5.5-1.8 1.2l-3 7c-.1.2-.2.5-.2.8v2c0 1.1.9 2 2 2h6.3l-1 4.6v.3c0 .4.2.8.4 1.1L10 23l6.4-6.4c.4-.4.6-.9.6-1.4V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>`;
const VOLUME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z"/></svg>`;
const VOLUME_MUTED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
interface AuxHandlers {
  onLike?: () => void;
  onDislike?: () => void;
  onVolumeChange?: (volume: number) => void;
  volume?: number;
  isLiked?: boolean;
  isDisliked?: boolean;
}

const STYLES = `
  html, body {
    margin: 0;
    padding: 0;
    background: #000;
    color: #fff;
    font-family: "Roboto", "YouTube Noto", sans-serif;
    height: 100%;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .pip {
    display: flex;
    flex-direction: row;
    height: 100%;
    padding: 0 8px 0 0;
    box-sizing: border-box;
    gap: clamp(6px, 3vw, 16px);
    position: relative;
    align-items: stretch;
  }
  .artwork-container {
    height: 100%;
    aspect-ratio: 1 / 1;
    max-width: 50%;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }
  .artwork {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .visualizer-canvas {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(4px, 3vh, 12px);
    padding: clamp(4px, 3vh, 14px) 0;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: clamp(1px, 1vh, 4px);
    margin-right: 20px;
  }
  .title {
    font-size: clamp(12px, 7vh, 22px);
    font-weight: 700;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fff;
    line-height: 1.3;
  }
  .artist {
    font-size: clamp(10px, 5.5vh, 17px);
    color: #aaa;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }
  .album {
    font-size: clamp(9px, 4.5vh, 15px);
    color: #717171;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }
  .progress-container {
    --progress-bar-bg: #333;
    --progress-fill-color: #f00;
    --progress-thumb-size: 0px;
    --progress-thumb-color: #f00;
    --progress-thumb-opacity: 0;
    --progress-transition: 0s;
    flex-shrink: 0;
    width: 100%;
    margin: 0;
  }
  .progress-container:hover {
    --progress-thumb-size: 10px;
    --progress-thumb-opacity: 1;
  }
  .progress-container .progress-time {
    display: none;
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(6px, 3vw, 16px);
    flex-shrink: 0;
  }
  .controls button {
    background: transparent;
    border: none;
    color: #fff;
    cursor: pointer;
    width: clamp(22px, 14vh, 40px);
    height: clamp(22px, 14vh, 40px);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 150ms ease, color 150ms ease, transform 100ms ease;
    opacity: 0.85;
  }
  .controls button svg {
    width: 75%;
    height: 75%;
  }
  .controls button:hover {
    background: rgba(255, 255, 255, 0.2);
    opacity: 1;
  }
  .controls button:active {
    transform: scale(0.9);
  }
  .controls button.active {
    color: #fff;
  }
  .controls .shuffle-btn,
  .controls .repeat-btn {
    color: #aaa;
    opacity: 1;
  }
  .controls .shuffle-btn.active,
  .controls .repeat-btn.active {
    color: #fff;
  }
  .controls .shuffle-btn:hover,
  .controls .repeat-btn:hover {
    color: #fff;
  }
  .controls .primary-control {
    width: clamp(28px, 18vh, 50px);
    height: clamp(28px, 18vh, 50px);
  }
  .control-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  .aux-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .aux-controls button {
    border: none;
    background: transparent;
    color: #aaa;
    width: clamp(18px, 10vh, 30px);
    height: clamp(18px, 10vh, 30px);
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: background 150ms ease, color 150ms ease;
  }
  .aux-controls button svg {
    width: 75%;
    height: 75%;
  }
  .aux-controls button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
  .aux-controls button.active {
    color: #fff;
  }
  .volume-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .volume-btn {
    border: none;
    background: transparent;
    color: #aaa;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: clamp(18px, 10vh, 30px);
    height: clamp(18px, 10vh, 30px);
    border-radius: 50%;
    transition: background 150ms ease, color 150ms ease;
  }
  .volume-btn svg {
    width: 75%;
    height: 75%;
  }
  .volume-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
  .volume-slider-wrap {
    overflow: hidden;
    max-width: 0;
    opacity: 0;
    transition: max-width 200ms ease, opacity 200ms ease;
    position: relative;
  }
  .volume-wrap:hover .volume-slider-wrap {
    max-width: 90px;
    opacity: 1;
  }
  .volume {
    width: 80px;
    margin-right: 10px;
    accent-color: #fff;
  }
  .volume-tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: #212121;
    color: #fff;
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 3px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.1s;
    margin-bottom: 6px;
  }
  .volume-slider-wrap:hover .volume-tooltip {
    opacity: 1;
  }

  @media (max-height: 140px) {
    .control-row {
      display: none;
    }
  }

  @media (max-height: 110px) {
    .album {
      display: none;
    }
  }
`;

export class PipWindowRenderer {
  private doc: Document | null = null;
  private docTitleEl: HTMLTitleElement | null = null;
  private artworkContainerEl: HTMLElement | null = null;
  private artworkEl: HTMLImageElement | null = null;
  private titleEl: HTMLElement | null = null;
  private artistEl: HTMLElement | null = null;
  private albumEl: HTMLElement | null = null;
  private shuffleBtn: HTMLButtonElement | null = null;
  private repeatBtn: HTMLButtonElement | null = null;
  private playPauseBtn: HTMLButtonElement | null = null;
  private progressBar: ProgressBarComponent | null = null;
  private likeBtn: HTMLButtonElement | null = null;
  private dislikeBtn: HTMLButtonElement | null = null;
  private volumeBtn: HTMLButtonElement | null = null;
  private volumeRange: HTMLInputElement | null = null;
  private preMuteVolume = 1;

  build(
    doc: Document,
    state: PlaybackState,
    onAction: (action: PlaybackAction) => void,
    onSeek?: (time: number) => void,
    aux?: AuxHandlers,
  ): void {
    this.doc = doc;
    doc.body.replaceChildren();

    this.docTitleEl =
      doc.head.querySelector("title") ?? doc.createElement("title");
    if (!this.docTitleEl.parentNode) {
      doc.head.appendChild(this.docTitleEl);
    }

    const style = doc.createElement("style");
    style.textContent = progressBarCss + STYLES;
    doc.head.appendChild(style);

    const pip = doc.createElement("div");
    pip.className = "pip";
    doc.body.appendChild(pip);

    // Artwork (left side)
    const artworkContainer = doc.createElement("div");
    artworkContainer.className = "artwork-container";
    this.artworkContainerEl = artworkContainer;

    const artwork = doc.createElement("img");
    artwork.className = "artwork";
    artwork.src = state.artworkUrl ?? "";
    artwork.alt = "Album art";
    this.artworkEl = artwork;

    artworkContainer.appendChild(artwork);
    pip.appendChild(artworkContainer);

    // Content (right side: meta + progress + controls)
    const content = doc.createElement("div");
    content.className = "content";
    pip.appendChild(content);

    const meta = doc.createElement("div");
    meta.className = "meta";
    content.appendChild(meta);

    const title = doc.createElement("div");
    title.className = "title";
    title.textContent = state.title ?? "";
    this.titleEl = title;
    meta.appendChild(title);

    const artist = doc.createElement("div");
    artist.className = "artist";
    artist.textContent = state.artist ?? "";
    this.artistEl = artist;
    meta.appendChild(artist);

    const albumLine = doc.createElement("div");
    albumLine.className = "album";
    albumLine.textContent = this.formatAlbumLine(state);
    this.albumEl = albumLine;
    meta.appendChild(albumLine);

    // Progress bar
    this.progressBar = createProgressBar({
      onSeek: (time) => onSeek?.(time),
      doc,
    });
    this.progressBar.setProgress(state.progress, state.duration);
    content.appendChild(this.progressBar.element);

    // Playback controls
    const controls = doc.createElement("div");
    controls.className = "controls";

    const shuffleBtn = this.createControlButton(
      doc,
      "shuffle",
      SHUFFLE_SVG,
      "Shuffle",
      onAction,
    );
    shuffleBtn.classList.add("shuffle-btn");
    this.shuffleBtn = shuffleBtn;

    const prevBtn = this.createControlButton(
      doc,
      "previous",
      PREV_SVG,
      "Previous",
      onAction,
    );
    const playPauseBtn = this.createControlButton(
      doc,
      "togglePlay",
      state.isPlaying ? PAUSE_SVG : PLAY_SVG,
      state.isPlaying ? "Pause" : "Play",
      onAction,
    );
    playPauseBtn.classList.add("primary-control");
    this.playPauseBtn = playPauseBtn;

    const nextBtn = this.createControlButton(
      doc,
      "next",
      NEXT_SVG,
      "Next",
      onAction,
    );

    const repeatBtn = this.createControlButton(
      doc,
      "repeat",
      this.getRepeatSvg(state.repeatMode),
      "Repeat",
      onAction,
    );
    repeatBtn.classList.add("repeat-btn");
    this.repeatBtn = repeatBtn;

    controls.appendChild(shuffleBtn);
    controls.appendChild(prevBtn);
    controls.appendChild(playPauseBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(repeatBtn);
    content.appendChild(controls);

    // Aux controls row (like/dislike + volume)
    const controlRow = doc.createElement("div");
    controlRow.className = "control-row";

    const auxControls = doc.createElement("div");
    auxControls.className = "aux-controls";

    const dislikeBtn = doc.createElement("button");
    setElementSvgIcon(dislikeBtn, THUMBS_DOWN_SVG, doc);
    dislikeBtn.setAttribute("aria-label", "Dislike");
    dislikeBtn.addEventListener("click", () => aux?.onDislike?.());
    this.dislikeBtn = dislikeBtn;
    auxControls.appendChild(dislikeBtn);

    const likeBtn = doc.createElement("button");
    setElementSvgIcon(likeBtn, THUMBS_UP_SVG, doc);
    likeBtn.setAttribute("aria-label", "Like");
    likeBtn.addEventListener("click", () => aux?.onLike?.());
    this.likeBtn = likeBtn;
    auxControls.appendChild(likeBtn);

    controlRow.appendChild(auxControls);

    const volumeWrap = doc.createElement("div");
    volumeWrap.className = "volume-wrap";

    const volumeBtn = doc.createElement("button");
    volumeBtn.className = "volume-btn";
    volumeBtn.setAttribute("aria-label", "Mute");
    const initialVol = aux?.volume ?? 1;
    setElementSvgIcon(
      volumeBtn,
      initialVol === 0 ? VOLUME_MUTED_SVG : VOLUME_SVG,
      doc,
    );
    this.preMuteVolume = initialVol > 0 ? initialVol : 1;
    volumeBtn.addEventListener("click", () => {
      const current = Number(this.volumeRange?.value ?? 0) / 100;
      if (current > 0) {
        this.preMuteVolume = current;
        aux?.onVolumeChange?.(0);
      } else {
        aux?.onVolumeChange?.(this.preMuteVolume);
      }
    });
    this.volumeBtn = volumeBtn;
    volumeWrap.appendChild(volumeBtn);

    const sliderWrap = doc.createElement("div");
    sliderWrap.className = "volume-slider-wrap";
    const volumeTooltip = doc.createElement("div");
    volumeTooltip.className = "volume-tooltip";
    volumeTooltip.textContent = Math.round(initialVol * 100) + "%";
    sliderWrap.appendChild(volumeTooltip);
    const volumeRange = doc.createElement("input");
    volumeRange.className = "volume";
    volumeRange.type = "range";
    volumeRange.min = "0";
    volumeRange.max = "100";
    volumeRange.value = String(Math.round(initialVol * 100));
    volumeRange.addEventListener("input", () => {
      const val = Number(volumeRange.value);
      volumeTooltip.textContent = val + "%";
      aux?.onVolumeChange?.(val / 100);
    });
    this.volumeRange = volumeRange;
    sliderWrap.appendChild(volumeRange);
    volumeWrap.appendChild(sliderWrap);
    controlRow.appendChild(volumeWrap);
    content.appendChild(controlRow);

    this.updateAuxState(
      aux?.volume ?? 1,
      aux?.isLiked === true,
      aux?.isDisliked === true,
    );
    this.updateControlStates(state);

    this.updateDocTitle(state);
  }

  update(state: PlaybackState): void {
    if (this.artworkEl) {
      this.artworkEl.src = state.artworkUrl ?? "";
    }
    if (this.titleEl) {
      this.titleEl.textContent = state.title ?? "";
    }
    if (this.artistEl) {
      this.artistEl.textContent = state.artist ?? "";
    }
    if (this.albumEl) {
      this.albumEl.textContent = this.formatAlbumLine(state);
    }
    this.progressBar?.setProgress(state.progress, state.duration);
    this.updateControlStates(state);
    this.updateDocTitle(state);
  }

  updateAuxState(volume: number, isLiked: boolean, isDisliked: boolean): void {
    const doc = this.doc ?? document;
    if (this.volumeRange) {
      const clamped = Math.max(0, Math.min(100, Math.round(volume * 100)));
      this.volumeRange.value = String(clamped);
    }
    if (this.volumeBtn) {
      setElementSvgIcon(
        this.volumeBtn,
        volume === 0 ? VOLUME_MUTED_SVG : VOLUME_SVG,
        doc,
      );
    }
    if (this.likeBtn) {
      this.likeBtn.classList.toggle("active", isLiked);
    }
    if (this.dislikeBtn) {
      this.dislikeBtn.classList.toggle("active", isDisliked);
    }
  }

  private updateControlStates(state: PlaybackState): void {
    const doc = this.doc ?? document;
    if (this.playPauseBtn) {
      setElementSvgIcon(
        this.playPauseBtn,
        state.isPlaying ? PAUSE_SVG : PLAY_SVG,
        doc,
      );
      this.playPauseBtn.setAttribute(
        "aria-label",
        state.isPlaying ? "Pause" : "Play",
      );
    }

    if (this.shuffleBtn) {
      this.shuffleBtn.classList.toggle("active", state.isShuffling);
    }

    if (this.repeatBtn) {
      setElementSvgIcon(
        this.repeatBtn,
        this.getRepeatSvg(state.repeatMode),
        doc,
      );
      this.repeatBtn.classList.toggle("active", state.repeatMode !== "off");
    }
  }

  private getRepeatSvg(mode?: "off" | "all" | "one"): string {
    if (mode === "one") return REPEAT_ONE_SVG;
    return REPEAT_SVG;
  }

  getArtworkContainer(): HTMLElement | null {
    return this.artworkContainerEl;
  }

  private updateDocTitle(state: PlaybackState): void {
    if (!this.doc) return;
    const title = state.title ?? "";
    const artist = state.artist ?? "";
    const docTitle = artist ? `${title} — ${artist}` : title;
    this.doc.title = docTitle;
    if (this.docTitleEl) {
      this.docTitleEl.textContent = docTitle;
    }
  }

  private formatAlbumLine(state: PlaybackState): string {
    const parts: string[] = [];
    if (state.album) parts.push(state.album);
    if (state.year) parts.push(String(state.year));
    return parts.join(" \u00B7 ");
  }

  private createControlButton(
    doc: Document,
    action: PlaybackAction,
    svg: string,
    label: string,
    onAction: (action: PlaybackAction) => void,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    setElementSvgIcon(button, svg, doc);
    button.setAttribute("data-action", action);
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => onAction(action));
    return button;
  }
}

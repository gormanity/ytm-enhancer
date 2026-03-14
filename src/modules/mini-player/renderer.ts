import type { PlaybackAction, PlaybackState } from "@/core/types";
import { setElementSvgIcon } from "@/core/svg-icon";
import {
  ProgressBarController,
  formatTimestamp,
  progressPercent,
} from "@/ui/progress-bar";

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>`;
const PREV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
const NEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z"/></svg>`;
const THUMBS_UP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L14 1 7.6 7.4C7.2 7.8 7 8.3 7 8.8V19c0 1.1.9 2 2 2h7c.8 0 1.5-.5 1.8-1.2l3-7c.1-.2.2-.5.2-.8v-2z"/></svg>`;
const THUMBS_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M15 3H8c-.8 0-1.5.5-1.8 1.2l-3 7c-.1.2-.2.5-.2.8v2c0 1.1.9 2 2 2h6.3l-1 4.6v.3c0 .4.2.8.4 1.1L10 23l6.4-6.4c.4-.4.6-.9.6-1.4V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>`;
const VOLUME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
interface AuxHandlers {
  onLike?: () => void;
  onDislike?: () => void;
  onVolumeChange?: (volume: number) => void;
  volume?: number;
  isLiked?: boolean;
  isDisliked?: boolean;
}

const STYLES = `
  body {
    margin: 0;
    padding: clamp(6px, 2.2vw, 10px);
    box-sizing: border-box;
    background: radial-gradient(circle at 20% -10%, #222 0%, #121212 58%);
    color: #fff;
    font-family: "Roboto", sans-serif;
    height: 100%;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: clamp(6px, 2.2vw, 10px);
    width: 100%;
    height: 100%;
    border-radius: 11px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.07),
      rgba(255, 255, 255, 0.03)
    );
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.32);
    padding: clamp(5px, 1.8vw, 8px);
    box-sizing: border-box;
    transition: background-color 140ms ease, border-color 140ms ease;
  }
  .artwork-container {
    width: clamp(18px, 22vw, 72px);
    height: clamp(18px, 22vw, 72px);
    flex-shrink: 1;
    min-width: 0;
    min-height: 0;
    position: relative;
  }
  .artwork {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 5px;
    display: block;
  }
  .visualizer-canvas {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    pointer-events: none;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }
  .primary-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .title {
    font-size: clamp(12px, 3.2vw, 13px);
    font-weight: 600;
    letter-spacing: 0.01em;
    text-align: left;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    flex-shrink: 0;
  }
  .artist {
    font-size: clamp(10px, 2.7vw, 11px);
    color: #b7b7b7;
    text-align: left;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    flex-shrink: 0;
  }
  .album {
    font-size: clamp(9px, 2.2vw, 10px);
    color: #919191;
    text-align: left;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    flex-shrink: 0;
  }
  .progress-container {
    width: 100%;
    margin: 3px 0 0;
    flex-shrink: 0;
  }
  .progress-bar {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.17);
    border-radius: 999px;
    position: relative;
    cursor: pointer;
    padding: 4px 0;
    background-clip: content-box;
  }
  .progress-fill {
    height: 3px;
    background: #fff;
    border-radius: 999px;
    transition: width 140ms ease-out;
    pointer-events: none;
    position: absolute;
    top: 4px;
    left: 0;
  }
  .progress-thumb {
    width: 7px;
    height: 7px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: left 140ms ease-out;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .time-display {
    font-size: 10px;
    color: #adadad;
    text-align: left;
    margin: 0;
    flex-shrink: 0;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 0;
    flex-shrink: 0;
  }
  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 1px;
    min-width: 0;
  }
  .controls button {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #fff;
    cursor: pointer;
    width: 31px;
    height: 31px;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 120ms ease, transform 120ms ease,
      border-color 120ms ease;
  }
  .controls button:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.16);
  }
  .controls button:active {
    transform: scale(0.96);
  }
  .controls .primary-control {
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.17);
    border-color: rgba(255, 255, 255, 0.22);
  }
  .aux-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 1;
    min-width: 0;
  }
  .aux-controls button {
    border: none;
    background: transparent;
    color: #bbb;
    width: clamp(18px, 8vw, 24px);
    height: clamp(18px, 8vw, 24px);
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: background-color 120ms ease, color 120ms ease,
      transform 120ms ease;
  }
  .aux-controls button:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
  .aux-controls button:active {
    transform: scale(0.96);
  }
  .aux-controls button.active {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .volume-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: clamp(34px, 14vw, 56px);
  }
  .volume-wrap svg {
    color: #aaa;
    flex-shrink: 0;
  }
  .volume {
    width: 100%;
    accent-color: #fff;
    margin: 0;
    min-width: 0;
    height: 14px;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 1px;
  }

  @media (max-width: 360px), (max-height: 160px) {
    .banner {
      gap: 8px;
      padding: 7px;
    }
    .artwork-container {
      width: clamp(30px, 24vw, 62px);
      height: clamp(30px, 24vw, 62px);
    }
    .title {
      font-size: 12px;
    }
    .artist {
      font-size: 10px;
    }
    .album {
      font-size: 9px;
    }
    .controls button {
      width: 28px;
      height: 28px;
    }
    .controls .primary-control {
      width: 32px;
      height: 32px;
    }
    .aux-controls button {
      width: 18px;
      height: 18px;
    }
    .volume-wrap {
      min-width: 36px;
    }
  }

  @media (max-width: 320px), (max-height: 145px) {
    body {
      padding: 8px;
    }
    .banner {
      gap: 7px;
      padding: 6px;
    }
    .artwork-container {
      width: clamp(24px, 25vw, 54px);
      height: clamp(24px, 25vw, 54px);
    }
    .album {
      display: none;
    }
    .progress-container {
      margin-top: 0;
    }
    .time-display {
      display: none;
    }
    .controls {
      margin-top: 0;
      gap: 4px;
    }
    .controls button {
      width: 26px;
      height: 26px;
    }
    .controls .primary-control {
      width: 29px;
      height: 29px;
    }
    .aux-controls {
      gap: 4px;
    }
    .aux-controls button {
      width: 16px;
      height: 16px;
    }
    .volume-wrap {
      min-width: 30px;
    }
    .volume-wrap svg {
      display: none;
    }
  }

  @media (max-width: 285px), (max-height: 124px) {
    .volume-wrap {
      display: none;
    }
  }

  @media (max-height: 112px) {
    .banner {
      gap: 5px;
      padding: 4px;
    }
    .artwork-container {
      width: clamp(18px, 22vw, 42px);
      height: clamp(18px, 22vw, 42px);
    }
    .primary-meta {
      flex-direction: row;
      align-items: baseline;
      gap: 5px;
    }
    .title {
      flex: 1;
      min-width: 0;
      font-size: 11px;
    }
    .artist {
      flex: 0 1 44%;
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .album,
    .progress-container,
    .time-display {
      display: none;
    }
  }

  @media (min-width: 460px) {
    .banner {
      gap: 12px;
      padding: 10px;
    }
    .artwork-container {
      width: clamp(42px, 18vw, 84px);
      height: clamp(42px, 18vw, 84px);
    }
    .title {
      font-size: 14px;
    }
    .artist {
      font-size: 12px;
    }
    .album {
      font-size: 11px;
    }
    .controls button {
      width: 32px;
      height: 32px;
    }
    .controls .primary-control {
      width: 38px;
      height: 38px;
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
  private playPauseBtn: HTMLButtonElement | null = null;
  private progressCtrl: ProgressBarController | null = null;
  private timeDisplayEl: HTMLElement | null = null;
  private likeBtn: HTMLButtonElement | null = null;
  private dislikeBtn: HTMLButtonElement | null = null;
  private volumeRange: HTMLInputElement | null = null;

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
    style.textContent = STYLES;
    doc.head.appendChild(style);

    const banner = doc.createElement("div");
    banner.className = "banner";
    doc.body.appendChild(banner);

    const artworkContainer = doc.createElement("div");
    artworkContainer.className = "artwork-container";
    this.artworkContainerEl = artworkContainer;

    const artwork = doc.createElement("img");
    artwork.className = "artwork";
    artwork.src = state.artworkUrl ?? "";
    artwork.alt = "Album art";
    this.artworkEl = artwork;

    artworkContainer.appendChild(artwork);
    banner.appendChild(artworkContainer);

    const info = doc.createElement("div");
    info.className = "info";
    banner.appendChild(info);

    const primaryMeta = doc.createElement("div");
    primaryMeta.className = "primary-meta";
    info.appendChild(primaryMeta);

    const title = doc.createElement("div");
    title.className = "title";
    title.textContent = state.title ?? "";
    this.titleEl = title;
    primaryMeta.appendChild(title);

    const artist = doc.createElement("div");
    artist.className = "artist";
    artist.textContent = state.artist ?? "";
    this.artistEl = artist;
    primaryMeta.appendChild(artist);

    const albumLine = doc.createElement("div");
    albumLine.className = "album";
    albumLine.textContent = this.formatAlbumLine(state);
    this.albumEl = albumLine;
    info.appendChild(albumLine);

    const progressContainer = doc.createElement("div");
    progressContainer.className = "progress-container";
    const progressBar = doc.createElement("div");
    progressBar.className = "progress-bar";

    const progressFill = doc.createElement("div");
    progressFill.className = "progress-fill";
    const pct = progressPercent(state.progress, state.duration);
    progressFill.style.width = pct + "%";

    const progressThumb = doc.createElement("div");
    progressThumb.className = "progress-thumb";
    progressThumb.style.left = pct + "%";

    progressBar.appendChild(progressFill);
    progressBar.appendChild(progressThumb);
    progressContainer.appendChild(progressBar);
    info.appendChild(progressContainer);

    this.progressCtrl = new ProgressBarController(
      { bar: progressBar, fill: progressFill, thumb: progressThumb },
      {
        onSeek: (time) => onSeek?.(time),
        doc,
      },
    );
    this.progressCtrl.setProgress(state.progress, state.duration);

    const timeDisplay = doc.createElement("div");
    timeDisplay.className = "time-display";
    timeDisplay.textContent = this.formatTimeDisplay(state);
    this.timeDisplayEl = timeDisplay;
    info.appendChild(timeDisplay);

    const controlRow = doc.createElement("div");
    controlRow.className = "control-row";

    const controls = doc.createElement("div");
    controls.className = "controls";

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
    const nextBtn = this.createControlButton(
      doc,
      "next",
      NEXT_SVG,
      "Next",
      onAction,
    );

    this.playPauseBtn = playPauseBtn;
    controls.appendChild(prevBtn);
    controls.appendChild(playPauseBtn);
    controls.appendChild(nextBtn);
    controlRow.appendChild(controls);

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

    const volumeWrap = doc.createElement("div");
    volumeWrap.className = "volume-wrap";
    setElementSvgIcon(volumeWrap, VOLUME_SVG, doc);
    const volumeRange = doc.createElement("input");
    volumeRange.className = "volume";
    volumeRange.type = "range";
    volumeRange.min = "0";
    volumeRange.max = "100";
    volumeRange.value = String(Math.round((aux?.volume ?? 1) * 100));
    volumeRange.addEventListener("input", () => {
      aux?.onVolumeChange?.(Number(volumeRange.value) / 100);
    });
    this.volumeRange = volumeRange;
    volumeWrap.appendChild(volumeRange);
    auxControls.appendChild(volumeWrap);
    controlRow.appendChild(auxControls);
    info.appendChild(controlRow);

    this.updateAuxState(
      aux?.volume ?? 1,
      aux?.isLiked === true,
      aux?.isDisliked === true,
    );

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
    this.progressCtrl?.setProgress(state.progress, state.duration);
    if (this.timeDisplayEl) {
      this.timeDisplayEl.textContent = this.formatTimeDisplay(state);
    }
    if (this.playPauseBtn) {
      setElementSvgIcon(
        this.playPauseBtn,
        state.isPlaying ? PAUSE_SVG : PLAY_SVG,
        this.doc ?? document,
      );
      this.playPauseBtn.setAttribute(
        "aria-label",
        state.isPlaying ? "Pause" : "Play",
      );
    }
    this.updateDocTitle(state);
  }

  updateAuxState(volume: number, isLiked: boolean, isDisliked: boolean): void {
    if (this.volumeRange) {
      const clamped = Math.max(0, Math.min(100, Math.round(volume * 100)));
      this.volumeRange.value = String(clamped);
    }
    if (this.likeBtn) {
      this.likeBtn.classList.toggle("active", isLiked);
    }
    if (this.dislikeBtn) {
      this.dislikeBtn.classList.toggle("active", isDisliked);
    }
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

  private formatTimeDisplay(state: PlaybackState): string {
    return `${formatTimestamp(state.progress)} / ${formatTimestamp(state.duration)}`;
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

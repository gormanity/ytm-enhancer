import type { PlaybackAction, PlaybackState } from "@/core/types";

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>`;
const PREV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
const NEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z"/></svg>`;

const STYLES = `
  body {
    margin: 0;
    background: #212121;
    color: #fff;
    font-family: "Roboto", sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    overflow: hidden;
  }
  .artwork {
    width: 60%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 4px;
    margin-bottom: 12px;
    flex-shrink: 1;
    min-height: 0;
  }
  .title {
    font-size: 1em;
    font-weight: 500;
    text-align: center;
    margin: 4px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90%;
    flex-shrink: 0;
  }
  .artist {
    font-size: 0.8125em;
    color: #aaa;
    text-align: center;
    margin: 2px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90%;
    flex-shrink: 0;
  }
  .album {
    font-size: 0.75em;
    color: #777;
    text-align: center;
    margin: 2px 8px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90%;
    flex-shrink: 0;
  }
  .progress-container {
    width: 80%;
    margin: 0 auto 4px;
    flex-shrink: 0;
  }
  .progress-bar {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 1.5px;
    position: relative;
    cursor: pointer;
    padding: 6px 0;
    background-clip: content-box;
  }
  .progress-fill {
    height: 3px;
    background: #fff;
    border-radius: 1.5px;
    transition: width 0.3s linear;
    pointer-events: none;
    position: absolute;
    top: 6px;
    left: 0;
  }
  .progress-thumb {
    width: 10px;
    height: 10px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: left 0.3s linear;
  }
  .time-display {
    font-size: 11px;
    color: #aaa;
    text-align: center;
    margin: 2px 0 8px;
    flex-shrink: 0;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 1em;
    flex-shrink: 0;
  }
  .controls button {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    padding: 0.5em;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .controls button:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

export class PipWindowRenderer {
  private doc: Document | null = null;
  private docTitleEl: HTMLTitleElement | null = null;
  private artworkEl: HTMLImageElement | null = null;
  private titleEl: HTMLElement | null = null;
  private artistEl: HTMLElement | null = null;
  private albumEl: HTMLElement | null = null;
  private playPauseBtn: HTMLButtonElement | null = null;
  private progressFill: HTMLElement | null = null;
  private progressThumb: HTMLElement | null = null;
  private progressBarEl: HTMLElement | null = null;
  private timeDisplayEl: HTMLElement | null = null;
  private onSeekCallback: ((time: number) => void) | null = null;
  private lastDuration = 0;

  build(
    doc: Document,
    state: PlaybackState,
    onAction: (action: PlaybackAction) => void,
    onSeek?: (time: number) => void,
  ): void {
    this.doc = doc;
    this.onSeekCallback = onSeek ?? null;
    this.lastDuration = state.duration;
    doc.body.innerHTML = "";

    this.docTitleEl =
      doc.head.querySelector("title") ?? doc.createElement("title");
    if (!this.docTitleEl.parentNode) {
      doc.head.appendChild(this.docTitleEl);
    }

    const style = doc.createElement("style");
    style.textContent = STYLES;
    doc.head.appendChild(style);

    const artwork = doc.createElement("img");
    artwork.className = "artwork";
    artwork.src = state.artworkUrl ?? "";
    artwork.alt = "Album art";
    this.artworkEl = artwork;
    doc.body.appendChild(artwork);

    const title = doc.createElement("div");
    title.className = "title";
    title.textContent = state.title ?? "";
    this.titleEl = title;
    doc.body.appendChild(title);

    const artist = doc.createElement("div");
    artist.className = "artist";
    artist.textContent = state.artist ?? "";
    this.artistEl = artist;
    doc.body.appendChild(artist);

    const albumLine = doc.createElement("div");
    albumLine.className = "album";
    albumLine.textContent = this.formatAlbumLine(state);
    this.albumEl = albumLine;
    doc.body.appendChild(albumLine);

    const progressContainer = doc.createElement("div");
    progressContainer.className = "progress-container";
    const progressBar = doc.createElement("div");
    progressBar.className = "progress-bar";
    this.progressBarEl = progressBar;

    const progressFill = doc.createElement("div");
    progressFill.className = "progress-fill";
    const pct = this.progressPercent(state);
    progressFill.style.width = pct + "%";
    this.progressFill = progressFill;

    const progressThumb = doc.createElement("div");
    progressThumb.className = "progress-thumb";
    progressThumb.style.left = pct + "%";
    this.progressThumb = progressThumb;

    progressBar.appendChild(progressFill);
    progressBar.appendChild(progressThumb);
    progressContainer.appendChild(progressBar);
    doc.body.appendChild(progressContainer);

    this.attachSeekListeners(doc, progressBar);

    const timeDisplay = doc.createElement("div");
    timeDisplay.className = "time-display";
    timeDisplay.textContent = this.formatTimeDisplay(state);
    this.timeDisplayEl = timeDisplay;
    doc.body.appendChild(timeDisplay);

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

    doc.body.appendChild(controls);

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
    this.lastDuration = state.duration;
    if (this.progressFill) {
      const pct = this.progressPercent(state) + "%";
      this.progressFill.style.width = pct;
      if (this.progressThumb) {
        this.progressThumb.style.left = pct;
      }
    }
    if (this.timeDisplayEl) {
      this.timeDisplayEl.textContent = this.formatTimeDisplay(state);
    }
    if (this.playPauseBtn) {
      this.playPauseBtn.innerHTML = state.isPlaying ? PAUSE_SVG : PLAY_SVG;
      this.playPauseBtn.setAttribute(
        "aria-label",
        state.isPlaying ? "Pause" : "Play",
      );
    }
    this.updateDocTitle(state);
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

  private attachSeekListeners(doc: Document, bar: HTMLElement): void {
    const seek = (e: MouseEvent) => {
      if (!this.onSeekCallback || this.lastDuration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      this.onSeekCallback(ratio * this.lastDuration);
    };

    bar.addEventListener("mousedown", (e: MouseEvent) => {
      seek(e);

      const onMove = (moveEvent: MouseEvent) => seek(moveEvent);
      const onUp = () => {
        doc.removeEventListener("mousemove", onMove);
        doc.removeEventListener("mouseup", onUp);
      };
      doc.addEventListener("mousemove", onMove);
      doc.addEventListener("mouseup", onUp);
    });
  }

  private progressPercent(state: PlaybackState): number {
    if (state.duration <= 0) return 0;
    return Math.round((state.progress / state.duration) * 100);
  }

  private formatTimeDisplay(state: PlaybackState): string {
    return `${this.formatTimestamp(state.progress)} / ${this.formatTimestamp(state.duration)}`;
  }

  private formatTimestamp(totalSeconds: number): string {
    const rounded = Math.floor(totalSeconds);
    const h = Math.floor(rounded / 3600);
    const m = Math.floor((rounded % 3600) / 60);
    const s = rounded % 60;

    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  private createControlButton(
    doc: Document,
    action: PlaybackAction,
    svg: string,
    label: string,
    onAction: (action: PlaybackAction) => void,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.innerHTML = svg;
    button.setAttribute("data-action", action);
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => onAction(action));
    return button;
  }
}

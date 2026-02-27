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
  }
  .artist {
    font-size: 0.8125em;
    color: #aaa;
    text-align: center;
    margin: 2px 8px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90%;
  }
  .progress-container {
    width: 80%;
    margin: 0 auto 4px;
  }
  .progress-bar {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 1.5px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #fff;
    border-radius: 1.5px;
    transition: width 0.3s linear;
  }
  .time-display {
    font-size: 11px;
    color: #aaa;
    text-align: center;
    margin: 2px 0 8px;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 1em;
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
  private artworkEl: HTMLImageElement | null = null;
  private titleEl: HTMLElement | null = null;
  private artistEl: HTMLElement | null = null;
  private playPauseBtn: HTMLButtonElement | null = null;
  private progressFill: HTMLElement | null = null;
  private timeDisplayEl: HTMLElement | null = null;

  build(
    doc: Document,
    state: PlaybackState,
    onAction: (action: PlaybackAction) => void,
  ): void {
    doc.body.innerHTML = "";

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

    const progressContainer = doc.createElement("div");
    progressContainer.className = "progress-container";
    const progressBar = doc.createElement("div");
    progressBar.className = "progress-bar";
    const progressFill = doc.createElement("div");
    progressFill.className = "progress-fill";
    progressFill.style.width = this.progressPercent(state) + "%";
    this.progressFill = progressFill;
    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressBar);
    doc.body.appendChild(progressContainer);

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
    if (this.progressFill) {
      this.progressFill.style.width = this.progressPercent(state) + "%";
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
  }

  private progressPercent(state: PlaybackState): number {
    if (state.duration <= 0) return 0;
    return Math.round((state.progress / state.duration) * 100);
  }

  private formatTimeDisplay(state: PlaybackState): string {
    return `${this.formatTimestamp(state.progress)} / ${this.formatTimestamp(state.duration)}`;
  }

  private formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

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

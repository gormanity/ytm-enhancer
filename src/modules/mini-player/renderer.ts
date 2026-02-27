import type { PlaybackAction, PlaybackState } from "@/core/types";

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>`;
const PREV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
const NEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm2 0h2V6h-2zM16 6v12h2V6z"/></svg>`;

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
    width: 200px;
    height: 200px;
    object-fit: cover;
    border-radius: 4px;
    margin-bottom: 12px;
  }
  .title {
    font-size: 16px;
    font-weight: 500;
    text-align: center;
    margin: 4px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }
  .artist {
    font-size: 13px;
    color: #aaa;
    text-align: center;
    margin: 2px 8px 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .controls button {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    padding: 8px;
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
    if (this.playPauseBtn) {
      this.playPauseBtn.innerHTML = state.isPlaying ? PAUSE_SVG : PLAY_SVG;
      this.playPauseBtn.setAttribute(
        "aria-label",
        state.isPlaying ? "Pause" : "Play",
      );
    }
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

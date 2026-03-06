import type { PlaybackState } from "@/core/types";
import type { PopupView } from "@/core/types";

/** Create the home/now-playing popup view. */
export function createHomePopupView(): PopupView {
  return {
    id: "home",
    label: "Now Playing",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Now Playing";
      container.appendChild(heading);

      const trackInfo = document.createElement("div");
      trackInfo.className = "home-track-info";
      container.appendChild(trackInfo);

      const artwork = document.createElement("img");
      artwork.className = "home-artwork";
      trackInfo.appendChild(artwork);

      const title = document.createElement("div");
      title.className = "home-track-title";
      trackInfo.appendChild(title);

      const artist = document.createElement("div");
      artist.className = "home-track-artist";
      trackInfo.appendChild(artist);

      const controls = document.createElement("div");
      controls.className = "home-controls";
      container.appendChild(controls);

      const prevBtn = createControlBtn(
        `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>`,
      );
      prevBtn.onclick = () => sendAction("previous");
      controls.appendChild(prevBtn);

      const playBtn = createControlBtn(
        `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
        true,
      );
      playBtn.onclick = () => sendAction("togglePlay");
      controls.appendChild(playBtn);

      const nextBtn = createControlBtn(
        `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
      );
      nextBtn.onclick = () => sendAction("next");
      controls.appendChild(nextBtn);

      const update = () => {
        chrome.runtime.sendMessage(
          { type: "get-playback-state" },
          (response: { ok: boolean; data?: PlaybackState } | null) => {
            if (response?.ok && response.data) {
              const state = response.data;
              if (state.artworkUrl) {
                artwork.src = state.artworkUrl;
                artwork.classList.add("home-artwork--visible");
              } else {
                artwork.classList.remove("home-artwork--visible");
              }
              title.textContent = state.title || "Unknown Track";
              artist.textContent = state.artist || "Unknown Artist";

              if (state.isPlaying) {
                playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
              } else {
                playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
              }
            } else {
              title.textContent = "YouTube Music not found";
              artist.textContent = "Open YTM to see now playing";
              artwork.classList.remove("home-artwork--visible");
              playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
            }
          },
        );
      };

      update();
      setInterval(update, 1000);

      // Cleanup when popup closes is automatic as the script context is destroyed.
    },
  };
}

function createControlBtn(svg: string, large = false): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.innerHTML = svg;
  btn.className = "home-control-btn";
  if (large) {
    btn.classList.add("home-control-btn--primary");
  }

  return btn;
}

function sendAction(action: string) {
  chrome.runtime.sendMessage({ type: "playback-action", action });
}

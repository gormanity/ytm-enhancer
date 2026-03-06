import type { PlaybackState } from "@/core/types";
import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { createSvgIconTemplate, setButtonSvgIcon } from "@/popup/svg-icon";
import templateHtml from "./popup.html?raw";

const PLAY_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
const PLAY_ICON_TEMPLATE = createSvgIconTemplate(PLAY_SVG);
const PAUSE_ICON_TEMPLATE = createSvgIconTemplate(PAUSE_SVG);

/** Create the home/now-playing popup view. */
export function createHomePopupView(): PopupView {
  return {
    id: "home",
    label: "Now Playing",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const artwork = container.querySelector<HTMLImageElement>(
        '[data-role="artwork"]',
      );
      const title = container.querySelector<HTMLElement>('[data-role="title"]');
      const artist = container.querySelector<HTMLElement>(
        '[data-role="artist"]',
      );
      const prevBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="previous"]',
      );
      const playBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="toggle-play"]',
      );
      const nextBtn =
        container.querySelector<HTMLButtonElement>('[data-role="next"]');
      if (!artwork || !title || !artist || !prevBtn || !playBtn || !nextBtn) {
        return;
      }

      prevBtn.onclick = () => sendAction("previous");
      playBtn.onclick = () => sendAction("togglePlay");
      nextBtn.onclick = () => sendAction("next");

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
              setButtonSvgIcon(
                playBtn,
                state.isPlaying ? PAUSE_ICON_TEMPLATE : PLAY_ICON_TEMPLATE,
              );
            } else {
              title.textContent = "YouTube Music not found";
              artist.textContent = "Open YTM to see now playing";
              artwork.classList.remove("home-artwork--visible");
              setButtonSvgIcon(playBtn, PLAY_ICON_TEMPLATE);
            }
          },
        );
      };

      update();
      const pollId = window.setInterval(update, 1000);
      return () => {
        window.clearInterval(pollId);
      };
    },
  };
}

function sendAction(action: string) {
  chrome.runtime.sendMessage({ type: "playback-action", action });
}

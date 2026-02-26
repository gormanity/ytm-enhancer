import { describe, it, expect, vi, beforeEach } from "vitest";
import { YTMAdapter } from "@/adapter";

describe("YTMAdapter", () => {
  let adapter: YTMAdapter;

  beforeEach(() => {
    document.body.innerHTML = "";
    adapter = new YTMAdapter();
  });

  describe("getPlaybackState", () => {
    it("should return null values when no player elements exist", () => {
      const state = adapter.getPlaybackState();

      expect(state.title).toBeNull();
      expect(state.artist).toBeNull();
      expect(state.album).toBeNull();
      expect(state.artworkUrl).toBeNull();
      expect(state.isPlaying).toBe(false);
      expect(state.progress).toBe(0);
      expect(state.duration).toBe(0);
    });

    it("should extract track title from the DOM", () => {
      document.body.innerHTML = `
        <yt-formatted-string class="title style-scope ytmusic-player-bar">Test Song</yt-formatted-string>
      `;

      const state = adapter.getPlaybackState();
      expect(state.title).toBe("Test Song");
    });

    it("should extract artist name from the DOM", () => {
      document.body.innerHTML = `
        <span class="subtitle style-scope ytmusic-player-bar">
          <yt-formatted-string>
            <a class="yt-simple-endpoint">Test Artist</a>
          </yt-formatted-string>
        </span>
      `;

      const state = adapter.getPlaybackState();
      expect(state.artist).toBe("Test Artist");
    });

    it("should detect playing state from play/pause button", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button id="play-pause-button" title="Pause"></tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.isPlaying).toBe(true);
    });

    it("should detect paused state from play/pause button", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button id="play-pause-button" title="Play"></tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.isPlaying).toBe(false);
    });

    it("should extract artwork URL", () => {
      document.body.innerHTML = `
        <img id="song-image" class="image style-scope ytmusic-player-bar" src="https://lh3.googleusercontent.com/test">
      `;

      const state = adapter.getPlaybackState();
      expect(state.artworkUrl).toBe("https://lh3.googleusercontent.com/test");
    });
  });

  describe("executeAction", () => {
    it("should click the play/pause button for togglePlay", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.id = "play-pause-button";
      button.click = vi.fn();
      document.body.appendChild(button);

      adapter.executeAction("togglePlay");

      expect(button.click).toHaveBeenCalled();
    });

    it("should click the play/pause button for play", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.id = "play-pause-button";
      button.setAttribute("title", "Play");
      button.click = vi.fn();
      document.body.appendChild(button);

      adapter.executeAction("play");

      expect(button.click).toHaveBeenCalled();
    });

    it("should not click play if already playing", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.id = "play-pause-button";
      button.setAttribute("title", "Pause");
      button.click = vi.fn();
      document.body.appendChild(button);

      adapter.executeAction("play");

      expect(button.click).not.toHaveBeenCalled();
    });

    it("should click the next button for next", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.className = "next-button";
      button.click = vi.fn();
      document.body.appendChild(button);

      adapter.executeAction("next");

      expect(button.click).toHaveBeenCalled();
    });

    it("should click the previous button for previous", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.className = "previous-button";
      button.click = vi.fn();
      document.body.appendChild(button);

      adapter.executeAction("previous");

      expect(button.click).toHaveBeenCalled();
    });
  });
});

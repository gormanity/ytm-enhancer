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
      expect(state.year).toBeNull();
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

    it("should read progress and duration from video element", () => {
      document.body.innerHTML = `<video class="html5-main-video"></video>`;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", { value: 83.4 });
      Object.defineProperty(video, "duration", { value: 225.7 });

      const state = adapter.getPlaybackState();
      expect(state.progress).toBe(83.4);
      expect(state.duration).toBe(225.7);
    });

    it("should return 0 for progress and duration when video element is missing", () => {
      document.body.innerHTML = "";

      const state = adapter.getPlaybackState();
      expect(state.progress).toBe(0);
      expect(state.duration).toBe(0);
    });

    it("should return 0 duration when video duration is NaN", () => {
      document.body.innerHTML = `<video class="html5-main-video"></video>`;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", { value: 0 });
      Object.defineProperty(video, "duration", { value: NaN });

      const state = adapter.getPlaybackState();
      expect(state.progress).toBe(0);
      expect(state.duration).toBe(0);
    });

    it("should extract album name from subtitle second link", () => {
      document.body.innerHTML = `
        <span class="subtitle style-scope ytmusic-player-bar">
          <yt-formatted-string>
            <a class="yt-simple-endpoint">Artist</a>
            &nbsp;•&nbsp;
            <a class="yt-simple-endpoint">My Album</a>
            &nbsp;•&nbsp;
            2024
          </yt-formatted-string>
        </span>
      `;

      const state = adapter.getPlaybackState();
      expect(state.album).toBe("My Album");
    });

    it("should extract year from subtitle text", () => {
      document.body.innerHTML = `
        <span class="subtitle style-scope ytmusic-player-bar">
          <yt-formatted-string>
            <a class="yt-simple-endpoint">Artist</a>
            &nbsp;•&nbsp;
            <a class="yt-simple-endpoint">My Album</a>
            &nbsp;•&nbsp;
            2024
          </yt-formatted-string>
        </span>
      `;

      const state = adapter.getPlaybackState();
      expect(state.year).toBe(2024);
    });

    it("should return null album when subtitle has only one link", () => {
      document.body.innerHTML = `
        <span class="subtitle style-scope ytmusic-player-bar">
          <yt-formatted-string>
            <a class="yt-simple-endpoint">Artist</a>
          </yt-formatted-string>
        </span>
      `;

      const state = adapter.getPlaybackState();
      expect(state.album).toBeNull();
    });

    it("should return null year when subtitle has no year", () => {
      document.body.innerHTML = `
        <span class="subtitle style-scope ytmusic-player-bar">
          <yt-formatted-string>
            <a class="yt-simple-endpoint">Artist</a>
            &nbsp;•&nbsp;
            <a class="yt-simple-endpoint">My Album</a>
          </yt-formatted-string>
        </span>
      `;

      const state = adapter.getPlaybackState();
      expect(state.year).toBeNull();
    });

    it("should extract artwork URL", () => {
      document.body.innerHTML = `
        <div class="thumbnail-image-wrapper style-scope ytmusic-player-bar">
          <img class="image" src="https://lh3.googleusercontent.com/test">
        </div>
      `;

      const state = adapter.getPlaybackState();
      expect(state.artworkUrl).toBe("https://lh3.googleusercontent.com/test");
    });

    it("should upscale artwork URL with size params", () => {
      document.body.innerHTML = `
        <div class="thumbnail-image-wrapper style-scope ytmusic-player-bar">
          <img class="image" src="https://lh3.googleusercontent.com/abc=w60-h60-l90-rj">
        </div>
      `;

      const state = adapter.getPlaybackState();
      expect(state.artworkUrl).toBe(
        "https://lh3.googleusercontent.com/abc=w544-h544-l90-rj",
      );
    });

    it("should upscale artwork URL with different size format", () => {
      document.body.innerHTML = `
        <div class="thumbnail-image-wrapper style-scope ytmusic-player-bar">
          <img class="image" src="https://lh3.googleusercontent.com/abc=w226-h226-l90-rj">
        </div>
      `;

      const state = adapter.getPlaybackState();
      expect(state.artworkUrl).toBe(
        "https://lh3.googleusercontent.com/abc=w544-h544-l90-rj",
      );
    });

    it("should not modify artwork URL without size params", () => {
      document.body.innerHTML = `
        <div class="thumbnail-image-wrapper style-scope ytmusic-player-bar">
          <img class="image" src="https://example.com/art.jpg">
        </div>
      `;

      const state = adapter.getPlaybackState();
      expect(state.artworkUrl).toBe("https://example.com/art.jpg");
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

  describe("seekTo", () => {
    it("should set video currentTime", () => {
      document.body.innerHTML = `<video class="html5-main-video"></video>`;
      const video = document.querySelector("video") as HTMLVideoElement;

      adapter.seekTo(83.5);

      expect(video.currentTime).toBe(83.5);
    });

    it("should do nothing when video element is missing", () => {
      document.body.innerHTML = "";

      expect(() => adapter.seekTo(50)).not.toThrow();
    });
  });
});

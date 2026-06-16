import { describe, it, expect, vi, beforeEach } from "vitest";
import { YTMAdapter } from "@/adapter";

describe("YTMAdapter", () => {
  let adapter: YTMAdapter;

  beforeEach(() => {
    document.body.innerHTML = "";
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: undefined,
    });
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
      expect(state.nextTrack).toBeNull();
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

    it("should prefer Media Session metadata for normalized track metadata", () => {
      Object.defineProperty(navigator, "mediaSession", {
        configurable: true,
        value: {
          metadata: {
            title: "Labour of Love",
            artist: "Ben McCullough",
            album: "Hardspace: Shipbreaker (Original Soundtrack)",
            artwork: [
              { src: "https://lh3.googleusercontent.com/session=w60-h60" },
            ],
          },
        },
      });
      document.body.innerHTML = `
        <yt-formatted-string class="title style-scope ytmusic-player-bar">
          Labour of Love (feat. Ben McCullough)
        </yt-formatted-string>
        <span class="subtitle style-scope ytmusic-player-bar">
          <yt-formatted-string>
            <a class="yt-simple-endpoint" href="/browse/MPREb_album">
              Hardspace: Shipbreaker (Original Soundtrack)
            </a>
            &nbsp;•&nbsp;
            2022
          </yt-formatted-string>
        </span>
      `;

      const state = adapter.getPlaybackState();
      expect(state.title).toBe("Labour of Love (feat. Ben McCullough)");
      expect(state.artist).toBe("Ben McCullough");
      expect(state.album).toBe("Hardspace: Shipbreaker (Original Soundtrack)");
      expect(state.year).toBe(2022);
      expect(state.artworkUrl).toBe(
        "https://lh3.googleusercontent.com/session=w544-h544-l90-rj",
      );
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

    it("should detect playing state from the media element when the button title is stale", () => {
      document.body.innerHTML = `
        <video class="html5-main-video"></video>
        <tp-yt-paper-icon-button id="play-pause-button" title="Play"></tp-yt-paper-icon-button>
      `;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "paused", { value: false });
      Object.defineProperty(video, "ended", { value: false });

      const state = adapter.getPlaybackState();
      expect(state.isPlaying).toBe(true);
    });

    it("should not treat ended media as playing when the button title is paused", () => {
      document.body.innerHTML = `
        <video class="html5-main-video"></video>
        <tp-yt-paper-icon-button id="play-pause-button" title="Play"></tp-yt-paper-icon-button>
      `;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "paused", { value: false });
      Object.defineProperty(video, "ended", { value: true });

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

    it("should prefer #time-info text over progress bar and video", () => {
      // #time-info shows YTM's per-track displayed times. Both
      // video.duration and progress-bar.max can be queue-wide when
      // YTM concatenates upcoming tracks into a single MediaSource buffer.
      document.body.innerHTML = `
        <video class="html5-main-video"></video>
        <tp-yt-paper-progress id="progress-bar" value="1142" max="1172"></tp-yt-paper-progress>
        <span id="time-info">1:23 / 3:31</span>
      `;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", { value: 1142 });
      Object.defineProperty(video, "duration", { value: 1172 });

      const state = adapter.getPlaybackState();
      expect(state.progress).toBe(83);
      expect(state.duration).toBe(211);
    });

    it("should prefer player bar .time-info text over stale progress sources", () => {
      document.body.innerHTML = `
        <video class="html5-main-video"></video>
        <tp-yt-paper-progress id="progress-bar" value="446" max="569"></tp-yt-paper-progress>
        <ytmusic-player-bar>
          <span class="time-info style-scope ytmusic-player-bar">3:13 / 5:17</span>
        </ytmusic-player-bar>
      `;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", { value: 446 });
      Object.defineProperty(video, "duration", { value: 569 });

      const state = adapter.getPlaybackState();
      expect(state.progress).toBe(193);
      expect(state.duration).toBe(317);
    });

    it("should parse hours, minutes, and seconds from #time-info", () => {
      document.body.innerHTML = `
        <span id="time-info">1:02:03 / 2:34:56</span>
      `;

      const state = adapter.getPlaybackState();
      expect(state.progress).toBe(3723);
      expect(state.duration).toBe(9296);
    });

    it("should fall back to progress bar when #time-info is absent", () => {
      document.body.innerHTML = `
        <video class="html5-main-video"></video>
        <tp-yt-paper-progress id="progress-bar" value="42" max="211"></tp-yt-paper-progress>
      `;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", { value: 1142 });
      Object.defineProperty(video, "duration", { value: 1172 });

      const state = adapter.getPlaybackState();
      expect(state.progress).toBe(42);
      expect(state.duration).toBe(211);
    });

    it("should fall back to video time when neither #time-info nor progress bar are populated", () => {
      document.body.innerHTML = `
        <video class="html5-main-video"></video>
        <tp-yt-paper-progress id="progress-bar"></tp-yt-paper-progress>
      `;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", { value: 12 });
      Object.defineProperty(video, "duration", { value: 100 });

      const state = adapter.getPlaybackState();
      expect(state.progress).toBe(12);
      expect(state.duration).toBe(100);
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

    it("should identify a single album link in the subtitle without treating it as the artist", () => {
      document.body.innerHTML = `
        <span class="subtitle style-scope ytmusic-player-bar">
          <yt-formatted-string>
            <a class="yt-simple-endpoint" href="/browse/MPREb_album">
              My Album
            </a>
            &nbsp;•&nbsp;
            2024
          </yt-formatted-string>
        </span>
      `;

      const state = adapter.getPlaybackState();
      expect(state.artist).toBeNull();
      expect(state.album).toBe("My Album");
      expect(state.year).toBe(2024);
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

    it("should extract next track metadata from the player queue", () => {
      document.body.innerHTML = `
        <ytmusic-player-queue>
          <ytmusic-player-queue-item selected>
            <yt-formatted-string class="song-title">Current Song</yt-formatted-string>
            <yt-formatted-string class="byline">
              <a href="/channel/current">Current Artist</a>
            </yt-formatted-string>
          </ytmusic-player-queue-item>
          <ytmusic-player-queue-item>
            <img class="image" src="https://lh3.googleusercontent.com/next=w60-h60-l90-rj">
            <yt-formatted-string class="song-title">Next Song</yt-formatted-string>
            <yt-formatted-string class="byline">
              <a href="/channel/next">Next Artist</a>
              &nbsp;•&nbsp;
              <a href="/browse/MPREb_next_album">Next Album</a>
              &nbsp;•&nbsp;
              2025
            </yt-formatted-string>
          </ytmusic-player-queue-item>
        </ytmusic-player-queue>
      `;

      const state = adapter.getPlaybackState();
      expect(state.nextTrack).toEqual({
        title: "Next Song",
        artist: "Next Artist",
        album: "Next Album",
        year: 2025,
        artworkUrl: "https://lh3.googleusercontent.com/next=w544-h544-l90-rj",
      });
    });

    it("should extract next track artist from plain queue byline text", () => {
      document.body.innerHTML = `
        <ytmusic-player-queue>
          <ytmusic-player-queue-item selected>
            <yt-formatted-string class="song-title">Current Song</yt-formatted-string>
          </ytmusic-player-queue-item>
          <ytmusic-player-queue-item>
            <yt-formatted-string class="song-title">Next Song</yt-formatted-string>
            <yt-formatted-string class="byline">
              Next Artist • Next Album • 2025
            </yt-formatted-string>
          </ytmusic-player-queue-item>
        </ytmusic-player-queue>
      `;

      const state = adapter.getPlaybackState();
      expect(state.nextTrack).toMatchObject({
        title: "Next Song",
        artist: "Next Artist",
        album: "Next Album",
        year: 2025,
      });
    });

    it("should extract next track artwork from lazy queue thumbnails", () => {
      document.body.innerHTML = `
        <ytmusic-player-queue>
          <ytmusic-player-queue-item selected>
            <yt-formatted-string class="song-title">Current Song</yt-formatted-string>
          </ytmusic-player-queue-item>
          <ytmusic-player-queue-item>
            <yt-img-shadow>
              <img
                id="img"
                data-thumb="https://lh3.googleusercontent.com/lazy=w60-h60-l90-rj"
                src=""
              >
            </yt-img-shadow>
            <yt-formatted-string class="song-title">Next Song</yt-formatted-string>
            <yt-formatted-string class="byline">Next Artist</yt-formatted-string>
          </ytmusic-player-queue-item>
        </ytmusic-player-queue>
      `;

      const state = adapter.getPlaybackState();
      expect(state.nextTrack?.artworkUrl).toBe(
        "https://lh3.googleusercontent.com/lazy=w544-h544-l90-rj",
      );
    });

    it("should return null next track when the queue has no following item", () => {
      document.body.innerHTML = `
        <ytmusic-player-queue>
          <ytmusic-player-queue-item selected>
            <yt-formatted-string class="song-title">Current Song</yt-formatted-string>
          </ytmusic-player-queue-item>
        </ytmusic-player-queue>
      `;

      const state = adapter.getPlaybackState();
      expect(state.nextTrack).toBeNull();
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

    it("should read repeat mode from the current repeat icon before tooltip text", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="repeat" title="Repeat all">
          <iron-icon icon="yt-icons:repeat-one"></iron-icon>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("one");
    });

    it("should read repeat one from the icon even when pressed state is false", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="repeat" title="Repeat all" aria-pressed="false">
          <iron-icon icon="yt-icons:repeat-one"></iron-icon>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("one");
    });

    it("should read playlist repeat from the current repeat icon before tooltip text", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="repeat" title="Repeat one" aria-pressed="true">
          <iron-icon icon="yt-icons:repeat"></iron-icon>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("all");
    });

    it("should read repeat off from the current YouTube Music repeat label", () => {
      document.body.innerHTML = `
        <yt-icon-button class="repeat" title="Repeat off" label="Repeat off">
          <button aria-label="Repeat off">
            <yt-icon>
              <svg>
                <path d="repeat-path"></path>
              </svg>
            </yt-icon>
          </button>
        </yt-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("off");
    });

    it("should read playlist repeat from the current YouTube Music repeat label", () => {
      document.body.innerHTML = `
        <yt-icon-button class="repeat" title="Repeat all" label="Repeat all">
          <button aria-label="Repeat all">
            <yt-icon style="color: rgb(255, 255, 255)">
              <svg>
                <path d="repeat-all-path-with-dot"></path>
              </svg>
            </yt-icon>
          </button>
        </yt-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("all");
    });

    it("should read repeat one from the current YouTube Music repeat label", () => {
      document.body.innerHTML = `
        <yt-icon-button class="repeat" title="Repeat one" label="Repeat one">
          <button aria-label="Repeat one">
            <yt-icon style="color: rgb(255, 255, 255)">
              <svg>
                <path d="repeat-one-path-with-number"></path>
              </svg>
            </yt-icon>
          </button>
        </yt-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("one");
    });

    it("should read repeat one from an active repeat off next-action label", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="repeat" title="Repeat off">
          <iron-icon icon="yt-icons:repeat" style="color: rgb(255, 255, 255)"></iron-icon>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("one");
    });

    it("should read repeat one from an active descendant off next-action label", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="repeat" aria-pressed="false">
          <yt-icon-button data-tooltip-text="Turn off">
            <iron-icon icon="yt-icons:repeat" style="color: rgb(255, 255, 255)"></iron-icon>
          </yt-icon-button>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("one");
    });

    it("should read repeat off from pressed state before tooltip text", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="repeat" title="Repeat all" aria-pressed="false">
          <iron-icon icon="yt-icons:repeat"></iron-icon>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("off");
    });

    it("should not treat an inactive generic repeat icon as playlist repeat", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="repeat" title="Repeat all">
          <iron-icon icon="yt-icons:repeat"></iron-icon>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("off");
    });

    it("should detect active shuffle from a nested icon color", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="shuffle">
          <iron-icon style="color: rgb(255, 255, 255)"></iron-icon>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.isShuffling).toBe(true);
    });

    it("should detect playlist repeat from a nested active icon color", () => {
      document.body.innerHTML = `
        <tp-yt-paper-icon-button class="repeat" title="Repeat one">
          <iron-icon icon="yt-icons:repeat" style="color: rgb(255, 255, 255)"></iron-icon>
        </tp-yt-paper-icon-button>
      `;

      const state = adapter.getPlaybackState();
      expect(state.repeatMode).toBe("all");
    });
  });

  describe("executeAction", () => {
    function makeVisible(el: HTMLElement): void {
      vi.spyOn(el, "getClientRects").mockReturnValue([
        new DOMRect(0, 0, 24, 24),
      ] as unknown as DOMRectList);
    }

    it("should click the play/pause button for togglePlay", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.id = "play-pause-button";
      const click = vi.fn();
      button.addEventListener("click", click);
      makeVisible(button);
      document.body.appendChild(button);

      const trackTitle = document.createElement("yt-formatted-string");
      trackTitle.className = "title style-scope ytmusic-player-bar";
      trackTitle.textContent = "Loaded Track";
      document.body.appendChild(trackTitle);

      adapter.executeAction("togglePlay");

      expect(click).toHaveBeenCalled();
    });

    it("should click a page play button for togglePlay when the player bar is unavailable", () => {
      const playerBarButton = document.createElement("tp-yt-paper-icon-button");
      playerBarButton.id = "play-pause-button";
      document.body.appendChild(playerBarButton);

      const pagePlayButton = document.createElement("button");
      pagePlayButton.setAttribute("aria-label", "Play Album");
      const pagePlayClick = vi.fn();
      pagePlayButton.addEventListener("click", pagePlayClick);
      makeVisible(pagePlayButton);
      document.body.appendChild(pagePlayButton);

      adapter.executeAction("togglePlay");

      expect(pagePlayClick).toHaveBeenCalled();
    });

    it("should click the play/pause button for play", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.id = "play-pause-button";
      button.setAttribute("title", "Play");
      const click = vi.fn();
      button.addEventListener("click", click);
      makeVisible(button);
      document.body.appendChild(button);

      const trackTitle = document.createElement("yt-formatted-string");
      trackTitle.className = "title style-scope ytmusic-player-bar";
      trackTitle.textContent = "Loaded Track";
      document.body.appendChild(trackTitle);

      adapter.executeAction("play");

      expect(click).toHaveBeenCalled();
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

    it("should not click play when media is already playing and the button title is stale", () => {
      document.body.innerHTML = `<video class="html5-main-video"></video>`;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "paused", { value: false });
      Object.defineProperty(video, "ended", { value: false });

      const button = document.createElement("tp-yt-paper-icon-button");
      button.id = "play-pause-button";
      button.setAttribute("title", "Play");
      button.click = vi.fn();
      document.body.appendChild(button);

      adapter.executeAction("play");

      expect(button.click).not.toHaveBeenCalled();
    });

    it("should click the next button for next", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.className = "next-button";
      const click = vi.fn();
      button.addEventListener("click", click);
      makeVisible(button);
      document.body.appendChild(button);

      adapter.executeAction("next");

      expect(click).toHaveBeenCalled();
    });

    it("should activate the first clickable matching transport button", () => {
      const hiddenButton = document.createElement("tp-yt-paper-icon-button");
      hiddenButton.className = "next-button";
      const hiddenClick = vi.fn();
      hiddenButton.addEventListener("click", hiddenClick);
      document.body.appendChild(hiddenButton);

      const visibleButton = document.createElement("tp-yt-paper-icon-button");
      visibleButton.className = "next-button";
      const events: string[] = [];
      for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
        visibleButton.addEventListener(type, () => events.push(type));
      }
      makeVisible(visibleButton);
      document.body.appendChild(visibleButton);

      adapter.executeAction("next");

      expect(hiddenClick).not.toHaveBeenCalled();
      expect(events).toEqual(["pointerdown", "mousedown", "mouseup", "click"]);
    });

    it("should activate loaded player bar play/pause with pointer events", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.id = "play-pause-button";
      const events: string[] = [];
      for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
        button.addEventListener(type, () => events.push(type));
      }
      makeVisible(button);
      document.body.appendChild(button);

      const trackTitle = document.createElement("yt-formatted-string");
      trackTitle.className = "title style-scope ytmusic-player-bar";
      trackTitle.textContent = "Loaded Track";
      document.body.appendChild(trackTitle);

      adapter.executeAction("togglePlay");

      expect(events).toEqual(["pointerdown", "mousedown", "mouseup", "click"]);
    });

    it("should click the previous button for previous", () => {
      const button = document.createElement("tp-yt-paper-icon-button");
      button.className = "previous-button";
      const click = vi.fn();
      button.addEventListener("click", click);
      makeVisible(button);
      document.body.appendChild(button);

      adapter.executeAction("previous");

      expect(click).toHaveBeenCalled();
    });

    it("should activate nested shuffle controls through the native click method", () => {
      const wrapper = document.createElement("div");
      wrapper.className = "shuffle";
      makeVisible(wrapper);

      const button = document.createElement("button");
      button.setAttribute("aria-label", "Shuffle");
      button.click = vi.fn();
      makeVisible(button);
      wrapper.appendChild(button);
      document.body.appendChild(wrapper);

      adapter.executeAction("shuffle");

      expect(button.click).toHaveBeenCalled();
    });

    it("should activate active nested shuffle controls through pointer events", () => {
      const wrapper = document.createElement("div");
      wrapper.className = "shuffle";
      makeVisible(wrapper);

      const icon = document.createElement("span");
      icon.style.color = "rgb(255, 255, 255)";

      const button = document.createElement("button");
      button.setAttribute("aria-label", "Shuffle");
      button.click = vi.fn();
      makeVisible(button);

      const events: string[] = [];
      for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
        button.addEventListener(type, () => events.push(type));
      }

      button.appendChild(icon);
      wrapper.appendChild(button);
      document.body.appendChild(wrapper);

      adapter.executeAction("shuffle");

      expect(button.click).not.toHaveBeenCalled();
      expect(events).toEqual(["pointerdown", "mousedown", "mouseup", "click"]);
    });

    it("should advance repeat in native YTM order", () => {
      const states = ["off", "one", "all"] as const;
      let stateIndex = 0;

      const wrapper = document.createElement("yt-icon-button");
      wrapper.className = "repeat";
      makeVisible(wrapper);

      const button = document.createElement("button");
      makeVisible(button);
      wrapper.appendChild(button);

      const setRepeatState = (state: (typeof states)[number]): void => {
        const label =
          state === "all"
            ? "Repeat all"
            : state === "one"
              ? "Repeat one"
              : "Repeat off";
        wrapper.setAttribute("label", label);
        wrapper.setAttribute("title", label);
        button.setAttribute("aria-label", label);
      };

      setRepeatState(states[stateIndex]);
      button.addEventListener("click", () => {
        stateIndex = (stateIndex + 1) % states.length;
        setRepeatState(states[stateIndex]);
      });
      document.body.appendChild(wrapper);

      adapter.executeAction("repeat");
      expect(adapter.getPlaybackState().repeatMode).toBe("all");

      adapter.executeAction("repeat");
      expect(adapter.getPlaybackState().repeatMode).toBe("one");

      adapter.executeAction("repeat");
      expect(adapter.getPlaybackState().repeatMode).toBe("off");
    });
  });

  describe("getPlaybackSpeed", () => {
    it("should return playback rate from video element", () => {
      document.body.innerHTML = `<video class="html5-main-video"></video>`;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "playbackRate", {
        value: 1.5,
        writable: true,
      });

      expect(adapter.getPlaybackSpeed()).toBe(1.5);
    });

    it("should return 1 when video element is missing", () => {
      document.body.innerHTML = "";

      expect(adapter.getPlaybackSpeed()).toBe(1);
    });
  });

  describe("setPlaybackSpeed", () => {
    it("should set playback rate on video element", () => {
      document.body.innerHTML = `<video class="html5-main-video"></video>`;
      const video = document.querySelector("video") as HTMLVideoElement;

      adapter.setPlaybackSpeed(2);

      expect(video.playbackRate).toBe(2);
    });

    it("should do nothing when video element is missing", () => {
      document.body.innerHTML = "";

      expect(() => adapter.setPlaybackSpeed(1.5)).not.toThrow();
    });
  });

  describe("getVolume", () => {
    it("should return volume from volume slider", () => {
      document.body.innerHTML = `<div id="volume-slider" value="75"></div>`;

      expect(adapter.getVolume()).toBe(0.75);
    });

    it("should return 1 when volume slider is missing", () => {
      document.body.innerHTML = "";

      expect(adapter.getVolume()).toBe(1);
    });
  });

  describe("setVolume", () => {
    it("should set value attribute on volume slider", () => {
      document.body.innerHTML = `<div id="volume-slider" value="100"></div>`;
      const slider = document.querySelector("#volume-slider")!;

      adapter.setVolume(0.5);

      expect(slider.getAttribute("value")).toBe("50");
    });

    it("should do nothing when volume slider is missing", () => {
      document.body.innerHTML = "";

      expect(() => adapter.setVolume(0.5)).not.toThrow();
    });
  });

  describe("isCurrentTrackDisliked", () => {
    it("should return true when like-status is DISLIKE", () => {
      document.body.innerHTML = `
        <ytmusic-like-button-renderer id="like-button-renderer" like-status="DISLIKE"></ytmusic-like-button-renderer>
      `;

      expect(adapter.isCurrentTrackDisliked()).toBe(true);
    });

    it("should return false when like-status is INDIFFERENT", () => {
      document.body.innerHTML = `
        <ytmusic-like-button-renderer id="like-button-renderer" like-status="INDIFFERENT"></ytmusic-like-button-renderer>
      `;

      expect(adapter.isCurrentTrackDisliked()).toBe(false);
    });

    it("should return false when like-status is LIKE", () => {
      document.body.innerHTML = `
        <ytmusic-like-button-renderer id="like-button-renderer" like-status="LIKE"></ytmusic-like-button-renderer>
      `;

      expect(adapter.isCurrentTrackDisliked()).toBe(false);
    });

    it("should return false when renderer is missing", () => {
      document.body.innerHTML = "";

      expect(adapter.isCurrentTrackDisliked()).toBe(false);
    });
  });

  describe("isCurrentTrackLiked", () => {
    it("should return true when like-status is LIKE", () => {
      document.body.innerHTML = `
        <ytmusic-like-button-renderer id="like-button-renderer" like-status="LIKE"></ytmusic-like-button-renderer>
      `;

      expect(adapter.isCurrentTrackLiked()).toBe(true);
    });

    it("should return false when like-status is INDIFFERENT", () => {
      document.body.innerHTML = `
        <ytmusic-like-button-renderer id="like-button-renderer" like-status="INDIFFERENT"></ytmusic-like-button-renderer>
      `;

      expect(adapter.isCurrentTrackLiked()).toBe(false);
    });

    it("should return false when renderer is missing", () => {
      document.body.innerHTML = "";

      expect(adapter.isCurrentTrackLiked()).toBe(false);
    });
  });

  describe("clickQuickPicksPlayAll", () => {
    it("should find Quick Picks shelf and click Play All", () => {
      // Each shelf renderer has its own #header div (YTM uses
      // shadow-DOM-like scoped IDs per custom element).
      const shelf1 = document.createElement("ytmusic-shelf-renderer");
      const header1 = document.createElement("div");
      header1.id = "header";
      header1.innerHTML = "<h2>Listen again</h2>";
      shelf1.appendChild(header1);
      const link1 = document.createElement("a");
      link1.className = "play-all";
      link1.textContent = "Play All";
      shelf1.appendChild(link1);
      document.body.appendChild(shelf1);

      const shelf2 = document.createElement("ytmusic-shelf-renderer");
      const header2 = document.createElement("div");
      header2.id = "header";
      header2.innerHTML = "<h2>Quick picks</h2>";
      shelf2.appendChild(header2);
      const playAllButton = document.createElement("a");
      playAllButton.className = "play-all";
      playAllButton.textContent = "Play All";
      playAllButton.click = vi.fn();
      shelf2.appendChild(playAllButton);
      document.body.appendChild(shelf2);

      const result = adapter.clickQuickPicksPlayAll();

      expect(result).toBe(true);
      expect(playAllButton.click).toHaveBeenCalled();
    });

    it("should return false when no Quick Picks shelf exists", () => {
      const shelf = document.createElement("ytmusic-shelf-renderer");
      const header = document.createElement("div");
      header.id = "header";
      header.innerHTML = "<h2>Listen again</h2>";
      shelf.appendChild(header);
      document.body.appendChild(shelf);

      const result = adapter.clickQuickPicksPlayAll();

      expect(result).toBe(false);
    });

    it("should return false when shelf has no Play All button", () => {
      const shelf = document.createElement("ytmusic-shelf-renderer");
      const header = document.createElement("div");
      header.id = "header";
      header.innerHTML = "<h2>Quick picks</h2>";
      shelf.appendChild(header);
      document.body.appendChild(shelf);

      const result = adapter.clickQuickPicksPlayAll();

      expect(result).toBe(false);
    });

    it("should return false when no shelves exist", () => {
      document.body.innerHTML = "";

      const result = adapter.clickQuickPicksPlayAll();

      expect(result).toBe(false);
    });
  });

  describe("clickFirstPlayButtonWhenPlayerBarClosed", () => {
    function makeVisible(el: HTMLElement): void {
      vi.spyOn(el, "getClientRects").mockReturnValue([
        new DOMRect(0, 0, 24, 24),
      ] as unknown as DOMRectList);
    }

    it("should click the first visible play button when player bar is closed", () => {
      const listenButton = document.createElement("button");
      listenButton.setAttribute("aria-label", "Listen again");
      listenButton.click = vi.fn();
      makeVisible(listenButton);
      document.body.appendChild(listenButton);

      const firstPlayButton = document.createElement("button");
      firstPlayButton.setAttribute("aria-label", "Play Mix");
      const firstClick = vi.fn();
      firstPlayButton.addEventListener("click", firstClick);
      makeVisible(firstPlayButton);
      document.body.appendChild(firstPlayButton);

      const secondPlayButton = document.createElement("button");
      secondPlayButton.setAttribute("aria-label", "Play Album");
      secondPlayButton.click = vi.fn();
      makeVisible(secondPlayButton);
      document.body.appendChild(secondPlayButton);

      const result = adapter.clickFirstPlayButtonWhenPlayerBarClosed();

      expect(result).toBe(true);
      expect(firstClick).toHaveBeenCalled();
      expect(secondPlayButton.click).not.toHaveBeenCalled();
      expect(listenButton.click).not.toHaveBeenCalled();
    });

    it("should not click page play buttons when player bar is open", () => {
      const playPauseButton = document.createElement("button");
      playPauseButton.id = "play-pause-button";
      makeVisible(playPauseButton);
      document.body.appendChild(playPauseButton);

      const trackTitle = document.createElement("yt-formatted-string");
      trackTitle.className = "title style-scope ytmusic-player-bar";
      trackTitle.textContent = "Loaded Track";
      document.body.appendChild(trackTitle);

      const pagePlayButton = document.createElement("button");
      pagePlayButton.setAttribute("aria-label", "Play Mix");
      const pagePlayClick = vi.fn();
      pagePlayButton.addEventListener("click", pagePlayClick);
      makeVisible(pagePlayButton);
      document.body.appendChild(pagePlayButton);

      const result = adapter.clickFirstPlayButtonWhenPlayerBarClosed();

      expect(result).toBe(false);
      expect(pagePlayClick).not.toHaveBeenCalled();
    });

    it("should click page play buttons when player bar has no loaded track", () => {
      const playPauseButton = document.createElement("button");
      playPauseButton.id = "play-pause-button";
      makeVisible(playPauseButton);
      document.body.appendChild(playPauseButton);

      const pagePlayButton = document.createElement("button");
      pagePlayButton.setAttribute("aria-label", "Play Mix");
      const pagePlayClick = vi.fn();
      pagePlayButton.addEventListener("click", pagePlayClick);
      makeVisible(pagePlayButton);
      document.body.appendChild(pagePlayButton);

      const result = adapter.clickFirstPlayButtonWhenPlayerBarClosed();

      expect(result).toBe(true);
      expect(pagePlayClick).toHaveBeenCalled();
    });

    it("should click page play buttons when player bar button is hidden", () => {
      const playPauseButton = document.createElement("button");
      playPauseButton.id = "play-pause-button";
      document.body.appendChild(playPauseButton);

      const pagePlayButton = document.createElement("button");
      pagePlayButton.setAttribute("aria-label", "Play Mix");
      const pagePlayClick = vi.fn();
      pagePlayButton.addEventListener("click", pagePlayClick);
      makeVisible(pagePlayButton);
      document.body.appendChild(pagePlayButton);

      const result = adapter.clickFirstPlayButtonWhenPlayerBarClosed();

      expect(result).toBe(true);
      expect(pagePlayClick).toHaveBeenCalled();
    });

    it("should skip disabled and hidden play buttons", () => {
      const disabledButton = document.createElement("button");
      disabledButton.setAttribute("aria-label", "Play Mix");
      disabledButton.setAttribute("disabled", "");
      disabledButton.click = vi.fn();
      makeVisible(disabledButton);
      document.body.appendChild(disabledButton);

      const hiddenButton = document.createElement("button");
      hiddenButton.setAttribute("aria-label", "Play Album");
      hiddenButton.click = vi.fn();
      document.body.appendChild(hiddenButton);

      const visibleButton = document.createElement("button");
      visibleButton.setAttribute("title", "Play Playlist");
      const visibleClick = vi.fn();
      visibleButton.addEventListener("click", visibleClick);
      makeVisible(visibleButton);
      document.body.appendChild(visibleButton);

      const result = adapter.clickFirstPlayButtonWhenPlayerBarClosed();

      expect(result).toBe(true);
      expect(disabledButton.click).not.toHaveBeenCalled();
      expect(hiddenButton.click).not.toHaveBeenCalled();
      expect(visibleClick).toHaveBeenCalled();
    });

    it("should click a YTM play button renderer", () => {
      const playRenderer = document.createElement(
        "ytmusic-play-button-renderer",
      ) as HTMLElement;
      const rendererClick = vi.fn();
      playRenderer.addEventListener("click", rendererClick);
      makeVisible(playRenderer);
      document.body.appendChild(playRenderer);

      const result = adapter.clickFirstPlayButtonWhenPlayerBarClosed();

      expect(result).toBe(true);
      expect(rendererClick).toHaveBeenCalled();
    });

    it("should activate a nested play control inside a play renderer", () => {
      const playRenderer = document.createElement(
        "ytmusic-play-button-renderer",
      ) as HTMLElement;
      const rendererClick = vi.fn();
      playRenderer.addEventListener("click", rendererClick);
      makeVisible(playRenderer);

      const nestedButton = document.createElement("button");
      nestedButton.setAttribute("aria-label", "Play Playlist");
      const nestedClick = vi.fn();
      nestedButton.addEventListener("click", nestedClick);
      makeVisible(nestedButton);
      playRenderer.appendChild(nestedButton);
      document.body.appendChild(playRenderer);

      const result = adapter.clickFirstPlayButtonWhenPlayerBarClosed();

      expect(result).toBe(true);
      expect(nestedClick).toHaveBeenCalled();
      expect(rendererClick).toHaveBeenCalled();
    });
  });

  describe("seekTo", () => {
    it("should seek through the YouTube Music progress bar when available", () => {
      document.body.innerHTML = `
        <input id="progress-bar" type="range" min="0" max="163" value="65" />
        <span id="time-info">1:23 / 3:31</span>
        <video class="html5-main-video"></video>
      `;
      const progressBar =
        document.querySelector<HTMLInputElement>("#progress-bar")!;
      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", {
        configurable: true,
        value: 0,
        writable: true,
      });
      const input = vi.fn();
      const change = vi.fn();
      progressBar.addEventListener("input", input);
      progressBar.addEventListener("change", change);

      adapter.seekTo(90);

      expect(progressBar.value).toBe("90");
      expect(input).toHaveBeenCalledTimes(1);
      expect(change).toHaveBeenCalledTimes(1);
      expect(video.currentTime).toBe(0);
    });

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

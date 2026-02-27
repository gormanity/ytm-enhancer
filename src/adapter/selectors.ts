/**
 * DOM selectors for YouTube Music player elements.
 *
 * All YTM DOM interaction is centralized here. If YouTube Music
 * changes its UI, only this file needs to be updated.
 */
export const SELECTORS = {
  playPauseButton: "#play-pause-button",
  nextButton: ".next-button",
  previousButton: ".previous-button",
  trackTitle: "yt-formatted-string.title.style-scope.ytmusic-player-bar",
  artistName:
    "span.subtitle.style-scope.ytmusic-player-bar yt-formatted-string a",
  albumArt:
    ".thumbnail-image-wrapper.style-scope.ytmusic-player-bar > img.image",
  progressBar: "#progress-bar",
  timeInfo: "#time-info",
  playerBarRightControls: ".right-controls-buttons.style-scope.ytmusic-player-bar",
  videoElement: "video.html5-main-video",
} as const;

import { createMessageHandler } from "@/core";
import type { PlaybackAction } from "@/core/types";
import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import { MiniPlayerController } from "@/modules/mini-player/controller";
import type {
  VisualizerColorMode,
  VisualizerStyleTunings,
  VisualizerStyle,
  VisualizerTarget,
} from "@/modules/audio-visualizer/styles";
import { VisualizerOverlayManager } from "@/modules/audio-visualizer/overlay-manager";
import { AudioBridgeInjector } from "./audio-bridge-injector";
import { QualityBridgeInjector } from "./quality-bridge-injector";
import { AutoPlayController } from "./auto-play";
import { DislikeObserver } from "./dislike-observer";
import { TrackObserver } from "./track-observer";
import { debug } from "@/core/logger";

const adapter = new YTMAdapter();
const handler = createMessageHandler();

handler.on("playback-action", async (message) => {
  if (message.action === "seekTo") {
    if (typeof message.time !== "number") {
      return { ok: false, error: "Invalid seek time" };
    }
    debug("playback-action: seekTo", message.time);
    adapter.seekTo(message.time);
    return { ok: true };
  }

  const action = message.action as PlaybackAction;
  debug("playback-action:", action);
  adapter.executeAction(action);
  return { ok: true };
});

handler.on("get-playback-state", async () => {
  const state = adapter.getPlaybackState();
  return { ok: true, data: state };
});

// --- Audio Visualizer ---

const audioBridge = new AudioBridgeInjector();
const overlayManager = new VisualizerOverlayManager();
let visualizerEnabled = false;
let visualizerColorMode: VisualizerColorMode = "white";
let visualizerActive = false;
let visualizerStateTimer: ReturnType<typeof setInterval> | null = null;
const VISUALIZER_STATE_POLL_MS = 1000;
let lastArtworkUrl: string | null = null;
const artworkColorCache = new Map<
  string,
  { r: number; g: number; b: number }
>();
let artworkColorRequestId = 0;

function safeSendMessage<TResponse>(
  message: unknown,
  callback: (response: TResponse | null) => void,
): void {
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        callback(null);
        return;
      }
      callback(response as TResponse);
    });
  } catch {
    callback(null);
  }
}

function shouldRunVisualizer(): boolean {
  if (!visualizerEnabled) return false;
  if (document.visibilityState !== "visible") return false;
  return adapter.getPlaybackState().isPlaying;
}

function setVisualizerColor(color: { r: number; g: number; b: number }): void {
  overlayManager.setColor(color);
}

function getStaticVisualizerColor(mode: VisualizerColorMode): {
  r: number;
  g: number;
  b: number;
} {
  if (mode === "monochrome-dim") return { r: 180, g: 180, b: 180 };
  return { r: 255, g: 255, b: 255 };
}

async function resolveArtworkDominantColor(
  artworkUrl: string,
): Promise<{ r: number; g: number; b: number } | null> {
  if (artworkColorCache.has(artworkUrl)) {
    return artworkColorCache.get(artworkUrl)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 24;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const pixels = ctx.getImageData(0, 0, size, size).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const alpha = pixels[i + 3];
          if (alpha < 16) continue;
          r += pixels[i];
          g += pixels[i + 1];
          b += pixels[i + 2];
          count++;
        }

        if (count === 0) {
          resolve(null);
          return;
        }

        const color = {
          r: Math.max(90, Math.min(255, Math.round(r / count))),
          g: Math.max(90, Math.min(255, Math.round(g / count))),
          b: Math.max(90, Math.min(255, Math.round(b / count))),
        };
        artworkColorCache.set(artworkUrl, color);
        resolve(color);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = artworkUrl;
  });
}

async function refreshVisualizerColor(): Promise<void> {
  if (visualizerColorMode !== "artwork-adaptive") {
    setVisualizerColor(getStaticVisualizerColor(visualizerColorMode));
    return;
  }

  const artworkUrl = adapter.getPlaybackState().artworkUrl;
  if (!artworkUrl) {
    setVisualizerColor(getStaticVisualizerColor("white"));
    return;
  }
  if (artworkUrl === lastArtworkUrl && artworkColorCache.has(artworkUrl)) {
    setVisualizerColor(artworkColorCache.get(artworkUrl)!);
    return;
  }

  lastArtworkUrl = artworkUrl;
  const requestId = ++artworkColorRequestId;
  const color = await resolveArtworkDominantColor(artworkUrl);
  if (requestId !== artworkColorRequestId) return;
  if (visualizerColorMode !== "artwork-adaptive") return;
  setVisualizerColor(color ?? getStaticVisualizerColor("white"));
}

function applyVisualizerRuntimeState(): void {
  const shouldRun = shouldRunVisualizer();
  if (shouldRun === visualizerActive) return;

  visualizerActive = shouldRun;
  if (shouldRun) {
    audioBridge.resume();
    overlayManager.startAll();
  } else {
    audioBridge.stop();
    overlayManager.stopAll();
  }
}

function startVisualizerStatePolling(): void {
  stopVisualizerStatePolling();
  visualizerStateTimer = setInterval(() => {
    applyVisualizerRuntimeState();
    void refreshVisualizerColor();
  }, VISUALIZER_STATE_POLL_MS);
}

function stopVisualizerStatePolling(): void {
  if (visualizerStateTimer !== null) {
    clearInterval(visualizerStateTimer);
    visualizerStateTimer = null;
  }
}

let visualizerSurfaceObserver: MutationObserver | null = null;

function attachVisualizerSurfaces(): void {
  if (!overlayManager.hasPlayerBarAttachment()) {
    const playerBarEl = document.querySelector<HTMLElement>(
      SELECTORS.playerBarThumbnail,
    );
    if (playerBarEl) {
      overlayManager.attachToPlayerBar(playerBarEl);
    }
  }
  if (!overlayManager.hasSongArtAttachment()) {
    const songArtEl = document.querySelector<HTMLElement>(
      SELECTORS.songArtPanel,
    );
    if (songArtEl) {
      overlayManager.attachToSongArt(songArtEl);
    }
  }
}

function observeVisualizerSurfaces(): void {
  if (visualizerSurfaceObserver) return;
  if (
    overlayManager.hasPlayerBarAttachment() &&
    overlayManager.hasSongArtAttachment()
  ) {
    return;
  }
  visualizerSurfaceObserver = new MutationObserver(() => {
    attachVisualizerSurfaces();
    if (
      overlayManager.hasPlayerBarAttachment() &&
      overlayManager.hasSongArtAttachment()
    ) {
      visualizerSurfaceObserver?.disconnect();
      visualizerSurfaceObserver = null;
    }
  });
  visualizerSurfaceObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopObservingVisualizerSurfaces(): void {
  visualizerSurfaceObserver?.disconnect();
  visualizerSurfaceObserver = null;
}

async function startVisualizer(): Promise<void> {
  await audioBridge.inject((data) => {
    overlayManager.updateFrequencyData(data);
  });

  attachVisualizerSurfaces();
  observeVisualizerSurfaces();

  startVisualizerStatePolling();
  applyVisualizerRuntimeState();
  await refreshVisualizerColor();
}

function stopVisualizer(): void {
  stopVisualizerStatePolling();
  stopObservingVisualizerSurfaces();
  visualizerActive = false;
  audioBridge.stop();
  overlayManager.stopAll();
  overlayManager.destroyAll();
}

handler.on("set-audio-visualizer-enabled", async (message) => {
  const enabled = message.enabled === true;
  if (enabled === visualizerEnabled) return { ok: true };
  visualizerEnabled = enabled;
  if (enabled) {
    void startVisualizer().catch(() => {
      visualizerEnabled = false;
    });
  } else {
    stopVisualizer();
  }
  return { ok: true };
});

handler.on("set-audio-visualizer-style", async (message) => {
  overlayManager.setStyle(message.style as VisualizerStyle);
  return { ok: true };
});

handler.on("set-audio-visualizer-target", async (message) => {
  overlayManager.setTarget(message.target as VisualizerTarget);
  return { ok: true };
});

handler.on("set-audio-visualizer-style-tunings", async (message) => {
  overlayManager.setStyleTunings(message.tunings as VisualizerStyleTunings);
  return { ok: true };
});

handler.on("set-audio-visualizer-color-mode", async (message) => {
  visualizerColorMode = message.mode as VisualizerColorMode;
  await refreshVisualizerColor();
  return { ok: true };
});

// --- Stream Quality ---

const qualityBridge = new QualityBridgeInjector();
let qualityBridgeReady = false;

async function ensureQualityBridge(): Promise<void> {
  if (qualityBridgeReady) return;
  await qualityBridge.inject();
  qualityBridgeReady = true;
}

handler.on("get-stream-quality", async () => {
  await ensureQualityBridge();
  const data = await qualityBridge.getQuality();
  return { ok: true, data };
});

handler.on("set-stream-quality", async (message) => {
  await ensureQualityBridge();
  qualityBridge.setQuality(message.value as string);
  return { ok: true };
});

// --- Playback Speed ---

handler.on("get-playback-speed", async () => {
  const speed = adapter.getPlaybackSpeed();
  return { ok: true, data: speed };
});

handler.on("set-playback-speed", async (message) => {
  adapter.setPlaybackSpeed(message.rate as number);
  return { ok: true };
});

// --- Precision Volume ---

handler.on("get-volume", async () => {
  const volume = adapter.getVolume();
  return { ok: true, data: volume };
});

handler.on("set-volume", async (message) => {
  adapter.setVolume(message.volume as number);
  return { ok: true };
});

// --- Auto-Skip Disliked ---

let autoSkipDislikedEnabled = false;

handler.on("set-auto-skip-disliked-enabled", async (message) => {
  autoSkipDislikedEnabled = message.enabled === true;
  return { ok: true };
});

handler.start();

document.addEventListener("visibilitychange", () => {
  applyVisualizerRuntimeState();
});

// Query initial visualizer state from background
safeSendMessage<{ ok: boolean; data?: boolean }>(
  { type: "get-audio-visualizer-enabled" },
  (response) => {
    if (response?.ok && response.data === true) {
      visualizerEnabled = true;
      void startVisualizer().catch(() => {
        visualizerEnabled = false;
      });
    }
  },
);

safeSendMessage<{ ok: boolean; data?: boolean }>(
  { type: "get-auto-skip-disliked-enabled" },
  (response) => {
    if (response?.ok && response.data === true) {
      autoSkipDislikedEnabled = true;
    }
  },
);

safeSendMessage<{ ok: boolean; data?: string }>(
  { type: "get-audio-visualizer-style" },
  (response) => {
    if (response?.ok && response.data) {
      overlayManager.setStyle(response.data as VisualizerStyle);
    }
  },
);

safeSendMessage<{ ok: boolean; data?: string }>(
  { type: "get-audio-visualizer-target" },
  (response) => {
    if (response?.ok && response.data) {
      overlayManager.setTarget(response.data as VisualizerTarget);
    }
  },
);

safeSendMessage<{ ok: boolean; data?: VisualizerStyleTunings }>(
  { type: "get-audio-visualizer-style-tunings" },
  (response) => {
    if (response?.ok && response.data) {
      overlayManager.setStyleTunings(response.data);
    }
  },
);

safeSendMessage<{ ok: boolean; data?: VisualizerColorMode }>(
  { type: "get-audio-visualizer-color-mode" },
  (response) => {
    if (response?.ok && response.data) {
      visualizerColorMode = response.data;
      void refreshVisualizerColor();
    }
  },
);

const dislikeObserver = new DislikeObserver((isDisliked) => {
  if (autoSkipDislikedEnabled && isDisliked) {
    adapter.executeAction("next");
  }
});
dislikeObserver.start();

const trackObserver = new TrackObserver(
  () => adapter.getPlaybackState(),
  () => dislikeObserver.reobserve(),
);
trackObserver.start();

const miniPlayerController = new MiniPlayerController(overlayManager);
void miniPlayerController.init();

const autoPlayController = new AutoPlayController();
autoPlayController.init();

import { createMessageHandler } from "@/core";
import type { PlaybackAction } from "@/core/types";
import { SELECTORS } from "@/adapter/selectors";
import { YTMAdapter } from "@/adapter";
import { MiniPlayerController } from "@/modules/mini-player/controller";
import type {
  VisualizerStyle,
  VisualizerTarget,
} from "@/modules/audio-visualizer/styles";
import { VisualizerOverlayManager } from "@/modules/audio-visualizer/overlay-manager";
import { AudioBridgeInjector } from "./audio-bridge-injector";
import { QualityBridgeInjector } from "./quality-bridge-injector";
import { AutoPlayController } from "./auto-play";
import { DislikeObserver } from "./dislike-observer";
import { TrackObserver } from "./track-observer";

const adapter = new YTMAdapter();
const handler = createMessageHandler();

handler.on("playback-action", async (message) => {
  const action = message.action as PlaybackAction;
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
let visualizerActive = false;
let visualizerStateTimer: ReturnType<typeof setInterval> | null = null;
const VISUALIZER_STATE_POLL_MS = 1000;

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
  }, VISUALIZER_STATE_POLL_MS);
}

function stopVisualizerStatePolling(): void {
  if (visualizerStateTimer !== null) {
    clearInterval(visualizerStateTimer);
    visualizerStateTimer = null;
  }
}

async function startVisualizer(): Promise<void> {
  await audioBridge.inject((data) => {
    overlayManager.updateFrequencyData(data);
  });

  const playerBarEl = document.querySelector<HTMLElement>(
    SELECTORS.playerBarThumbnail,
  );
  if (playerBarEl) {
    overlayManager.attachToPlayerBar(playerBarEl);
  }

  const songArtEl = document.querySelector<HTMLElement>(SELECTORS.songArtPanel);
  if (songArtEl) {
    overlayManager.attachToSongArt(songArtEl);
  }

  startVisualizerStatePolling();
  applyVisualizerRuntimeState();
}

function stopVisualizer(): void {
  stopVisualizerStatePolling();
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

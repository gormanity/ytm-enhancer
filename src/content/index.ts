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

async function startVisualizer(): Promise<void> {
  await audioBridge.inject((data) => {
    overlayManager.updateFrequencyData(data);
  });
  audioBridge.start();

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

  overlayManager.startAll();
}

function stopVisualizer(): void {
  audioBridge.stop();
  overlayManager.stopAll();
  overlayManager.destroyAll();
}

handler.on("set-audio-visualizer-enabled", async (message) => {
  const enabled = message.enabled === true;
  if (enabled === visualizerEnabled) return { ok: true };
  visualizerEnabled = enabled;
  if (enabled) {
    void startVisualizer();
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

handler.start();

// Query initial visualizer state from background
chrome.runtime.sendMessage(
  { type: "get-audio-visualizer-enabled" },
  (response: { ok: boolean; data?: boolean }) => {
    if (response?.ok && response.data === true) {
      visualizerEnabled = true;
      void startVisualizer();
    }
  },
);

chrome.runtime.sendMessage(
  { type: "get-audio-visualizer-style" },
  (response: { ok: boolean; data?: string }) => {
    if (response?.ok && response.data) {
      overlayManager.setStyle(response.data as VisualizerStyle);
    }
  },
);

chrome.runtime.sendMessage(
  { type: "get-audio-visualizer-target" },
  (response: { ok: boolean; data?: string }) => {
    if (response?.ok && response.data) {
      overlayManager.setTarget(response.data as VisualizerTarget);
    }
  },
);

const trackObserver = new TrackObserver(() => adapter.getPlaybackState());
trackObserver.start();

const miniPlayerController = new MiniPlayerController(overlayManager);
void miniPlayerController.init();

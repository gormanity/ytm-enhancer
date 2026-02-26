import { createMessageHandler } from "@/core";
import type { PlaybackAction } from "@/core/types";
import { YTMAdapter } from "@/adapter";

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

handler.start();
